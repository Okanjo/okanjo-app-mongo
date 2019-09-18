"use strict";

const should = require('should');
const CrudService = require('../CrudService');

describe('CrudService', () => {

    const OkanjoApp = require('okanjo-app');
    const MongoService = require('../MongoService');
    const DoodadService = require('./app/services/doodad_service');
    const config = require('./app/config');
    const cleanup = { ids: [] };

    let app;
    let fauxService;

    // Init
    before(async () => {

        app = new OkanjoApp(config);

        app.prefixes = {
            doodad: 'dood'
        };

        app.prefixAliases = {
            doodad: 'DD'
        };
        
        app.services = {
            doodad: new DoodadService(app)
        };

        // Shortcut the db db service (instead of services)
        app.dbs = new MongoService(app);

        await app.connectToServices();

        // purge any existing records
        await app.dbs.widgets.Doodad.deleteMany({});

        class FauxService extends CrudService {
            constructor(app) {
                super(app, app.dbs.widgets.Doodad);
            }
        }

        fauxService = new FauxService(app);
    });

    // Cleanup
    after(async () => {
        for (let id of cleanup.ids) {
            await app.dbs.widgets.Doodad.findOneAndDelete({ _id: id });
        }
    });

    describe('_create', () => {

        it('reports error and fails on id collision', async () => {
            // Create a document that will serve as the existing one to test collisions
            const doc = await fauxService._create({
                name: "unit test: id to collide",
                key: "DDcollide",
                status: 'active'
            });
            should(doc).be.ok();

            cleanup.ids.push(doc._id);
            doc._id.should.be.an.Object();

            // Now try creating a duplicate to test the error
            try {
                await fauxService._create({
                    _id: doc._id,
                    name: "unit test: this doc should not get saved",
                    key: "DDcollide",
                    status: 'active'
                });
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('NOPE');
            } catch(err) {
                should(err).be.ok();
                err.message.should.not.match(/NOPE/);
            }
        });
    });

    describe('_createWithRetry', () => {

        it('actually works on collision, stops on max attempts and can succeed)', async () => {

            // Create a document that will serve as the existing one to test collisions
            let doc = await fauxService._create({
                name: "unit test: id to collide",
                key: "DDcollide2",
                status: 'active'
            });
            should(doc).be.ok();

            cleanup.ids.push(doc._id);
            doc._id.should.be.an.Object();
            const id = doc._id;

            let tries = 0;

            // Now try the retry handler
            try {
                await fauxService._createWithRetry({
                    _id: id,
                    name: "unit test: retry collision candidate",
                    key: "DDcollide2",
                    status: 'active'
                }, (data, attempts) => {

                    // Should not have exceeded the number of tries
                    attempts.should.be.lessThan(fauxService._createRetryCount);
                    attempts.should.equal(tries);
                    tries++;

                    // be a stick in the mud, should do three attempts and give up
                    return {
                        _id: id,
                        name: "unit test: this doc should not get saved",
                        key: "DDcollide2",
                        status: 'active'
                    };

                });
                // noinspection ExceptionCaughtLocallyJS
                throw new Error('NOPE');
            } catch (err) {
                should(err).be.ok();
                should(err.message).not.match(/NOPE/)
            }

            // Now do it again, but this time let the closure fix the record to let it succeed
            // Now try the retry handler
            doc = await fauxService._createWithRetry({
                _id: id,
                name: "unit test: retry collision candidate",
                key: "DDcollide2",
                status: 'active'
            }, (data, attempts) => {

                // Should not have exceeded the number of tries
                attempts.should.be.lessThan(fauxService._createRetryCount);
                (tries + attempts).should.equal(tries);
                tries++;

                // be a stick in the mud, should do three attempts and give up
                return {
                    name: "unit test: this doc should succeed",
                    key: app.services.doodad.generateKey(),
                    status: 'active'
                };

            });

            should(doc).be.ok();

            cleanup.ids.push(doc._id);
            doc._id.should.be.an.Object();
        });

    });

    describe('_retrieve', () => {
        it('calls back with nothing when no id is given', async () => {
            const doc = await fauxService._retrieve();
            should(doc).not.be.ok();
        });

        it('does not retrieve dead resources', async () => {
            let doc = await fauxService._create({
                name: "unit test: dead no retrieve",
                key: "DDdead1",
                status: 'dead'
            });
            should(doc).be.ok();

            cleanup.ids.push(doc._id);
            doc._id.should.be.an.Object();

            // Should not return
            doc = await fauxService._retrieve(doc._id);
            should(doc).be.exactly(null);
        });

        it('can retrieve dead resources if concealment is off', async () => {

            // turn off concealment
            fauxService._concealDeadResources = false;

            let doc = await fauxService._create({
                name: "unit test: dead no retrieve",
                key: "DDdead2",
                status: 'dead'
            });
            should(doc).be.ok();

            cleanup.ids.push(doc._id);
            doc._id.should.be.an.Object();

            // Should not return
            doc = await fauxService._retrieve(doc._id);
            should(doc).be.ok();
            doc.key.should.equal('DDdead2');

            // turn concealment back on
            // eslint-disable-next-line require-atomic-updates
            fauxService._concealDeadResources = true;
        });
    });

    describe('_buildQuery', () => {

        it('can build a quiery with no options', () => {
            const q = fauxService._buildQuery({name: /^unit test: find/});
            q.should.be.an.Object();
        });

    });

    describe('_find', () => {

        // Create a set of doodads to search on
        before(async () => {

            const doodads = [
                {
                    name: "unit test: find - A",
                    key: app.services.doodad.generateKey(),
                    status: 'active'
                },
                {
                    name: "unit test: find - B",
                    key: app.services.doodad.generateKey(),
                    status: 'active'
                },
                {
                    name: "unit test: find - C",
                    key: app.services.doodad.generateKey(),
                    status: 'pending'
                },
                {
                    name: "unit test: find - deleted",
                    key: app.services.doodad.generateKey(),
                    status: 'dead'
                }
            ];

            for (let doodad of doodads) {
                let doc = await fauxService._create(doodad);
                if (doc) cleanup.ids.push(doc._id);
            }

        });

        it('does not need options', async () => {
            const docs = await fauxService._find({name: /^unit test: find/});
            should(docs).be.an.Array();

            docs.length.should.be.equal(3);
        });

        it('does not return dead resources (merge status)', async () => {
            const docs = await fauxService._find({name: /^unit test: find/, status: "pending"});
            should(docs).be.an.Array();

            docs.length.should.be.equal(1);
        });

        it('does not return dead resources (merge $and status)', async () => {
            const docs = await fauxService._find({$and: [{name: /^unit test: find/}], status: "pending"});
            should(docs).be.an.Array();

            docs.length.should.be.equal(1);
        });

        it('does return dead resources when overridden', async () => {
            const docs = await fauxService._find({name: /^unit test: find/}, {conceal: false});
            should(docs).be.an.Array();

            docs.length.should.be.equal(4);
        });

        it('handles pagination, sort, fields, and other options', async () => {
            let docs = await fauxService._find({
                name: /^unit test: find/
            }, {
                skip: 1,
                take: 1,
                sort: { created: -1, _id: -1 },
                fields: "name created"
            });
            should(docs).be.an.Array();

            // These fields should be present
            should(docs[0]._id).be.ok();
            should(docs[0].created).be.an.Object();
            should(docs[0].name).be.ok();

            // These should not
            should(docs[0].updated).not.be.ok();
            should(docs[0].status).not.be.ok();
            should(docs[0].key).not.be.ok();
            should(docs[0].__v).not.be.ok();

            docs.length.should.be.equal(1);
            docs[0].name.should.match(/B$/);

            // Paginate to the last page to really test skip/take/sort
            docs = await fauxService._find({
                name: /^unit test: find/
            }, {
                skip: 2,
                take: 1,
                sort: { created: -1, _id: -1 },
                fields: "name created",
                comment: 'unit test cursor'
            });
            should(docs).be.an.Array();

            docs.length.should.be.equal(1);
            docs[0].name.should.match(/A$/);
        });

        it('will not exec if told not to', async () => {
            const q = fauxService._buildQuery({name: /^unit test: find/}, {exec: false});

            // Should return a query object
            q.should.be.an.Object();
            const docs = await q.exec();
            should(docs).be.an.Array();

            docs.length.should.be.equal(3);
        });

        it('will report errors', async () => {
            try {
                await fauxService._find({_things: {$in: "nope"}});
            } catch (err) {
                should(err).be.ok();
                err.code.should.be.greaterThan(0); // this was 17287 in mongo 3.2, in 3.5 it's now just 2 ¯\_(ツ)_/¯
            }
        });
    });

    describe('_update', () => {

        it('applies data props` correctly', async () => {
            let doc = await fauxService._create({
                name: "unit test: update me ",
                key: app.services.doodad.generateKey(),
                status: 'active'
            });
            should(doc).be.ok();

            cleanup.ids.push(doc._id);
            doc._id.should.be.an.Object();

            // Allow name to get copied
            // eslint-disable-next-line require-atomic-updates
            fauxService._modifiableKeys = ['name'];

            // Now change it
            doc = await fauxService._update(doc, {
                name: "unit test: updated!"
            });
            should(doc).be.ok();

            should(doc.name).be.equal("unit test: updated!");
        });

        it('is not dirty if nothing changed', async () => {
            let doc = await fauxService._create({
                name: "unit test: update me",
                key: app.services.doodad.generateKey(),
                status: 'active'
            });
            should(doc).be.ok();

            cleanup.ids.push(doc._id);
            doc._id.should.be.an.Object();

            // Now change it
            doc = await fauxService._update(doc, {
                nope: "unit test: updated!"
            });
            should(doc).be.ok();

            should(doc.nope).not.be.ok();
        });

        it('reports on error', async () => {

            // Create a doodad
            let doc1 = await fauxService._create({
                name: "unit test: update for delete 1",
                key: app.services.doodad.generateKey(),
                status: 'active'
            });
            should(doc1).be.ok();

            cleanup.ids.push(doc1._id);
            doc1._id.should.be.an.Object();

            // Create a second doodad
            let doc2 = await fauxService._create({
                name: "unit test: update for delete 2",
                key: app.services.doodad.generateKey(),
                status: 'active'
            });
            should(doc2).be.ok();

            cleanup.ids.push(doc2._id);
            doc2._id.should.be.an.Object();

            // Update the second doodad to have the same DD as the first - should result in an error
            doc2.key = doc1.key;

            try {
                await fauxService._update(doc2);
                should(false).be.exactly(true);
            } catch(err) {
                should(err).be.ok();
            }
        });
    });

    describe('_delete', () => {

        it('changes status to dead', async () => {
            let doc = await fauxService._create({
                name: "unit test: delete me",
                key: app.services.doodad.generateKey(),
                status: 'active'
            });
            should(doc).be.ok();

            cleanup.ids.push(doc._id);
            doc._id.should.be.an.Object();

            doc.status.should.be.equal('active');

            // Now "delete" it
            doc = await fauxService._delete(doc);
            should(doc).be.ok();

            doc.status.should.be.equal('dead');

        });
    });

    describe('_deletePermanently', () => {

        it('works as intended', async () => {
            let doc = await fauxService._create({
                name: "unit test: delete me really dead",
                key: app.services.doodad.generateKey(),
                status: 'active'
            });
            should(doc).be.ok();

            // Now kill it
            doc = await fauxService._deletePermanently(doc);
            should(doc).be.ok();

            doc = await fauxService._retrieve(doc._id);
            should(doc).be.exactly(null);

        });
    });

    describe('_count', () => {

        it('works as intended', async () => {
            let doc = await fauxService._create({
                name: "unit test: delete me really dead",
                key: app.services.doodad.generateKey(),
                status: 'active'
            });
            should(doc).be.ok();

            cleanup.ids.push(doc._id);

                // Now count it
            let firstCount = await fauxService._count({ name: /unit test/ });
            should(firstCount).be.a.Number().and.greaterThan(0);

            // Now count it with options
            let count = await fauxService._count({ name: /unit test/ }, {});
            firstCount.should.be.exactly(count);

            // Now count it with shitty options
            count = await fauxService._count({ name: /unit test/ }, null);
            firstCount.should.be.exactly(count);
        });
    });

});
