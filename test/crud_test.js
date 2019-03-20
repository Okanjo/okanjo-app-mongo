"use strict";

const should = require('should');
const CrudService = require('../CrudService');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const async = require('async');

describe('CrudService', () => {

    const OkanjoApp = require('okanjo-app');
    const MongoService = require('../MongoService');
    const DoodadService = require('./app/services/doodad_service');
    const config = require('./app/config');
    const cleanup = { ids: [] };

    let app;
    let fauxService;

    // Init
    before(done => {

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

        app.connectToServices(() => {
            // purge any existing records
            app.dbs.widgets.Doodad.deleteMany({}, (err) => {
                done(err);
            });
        });
    });

    // Cleanup
    after(done => {

        // Perm delete the doodads from the DB
        async.each(cleanup.ids, (id, next) => {
            app.dbs.widgets.Doodad.findOneAndDelete({ _id: id }, (/*err, doc*/) => {
                // if (err) console.error('Failed to cleanup doodad', err, doc, id);
                next();
            });
        }, done);

    });

    it ('can be extended', () => {

        class FauxService extends CrudService {
            constructor(app) {
                super(app, app.dbs.widgets.Doodad);
            }
        }

        fauxService = new FauxService(app);
    });

    describe('_create', () => {
        it('reports error and fails on id collision', done => {
            // Create a document that will serve as the existing one to test collisions
            fauxService._create({
                name: "unit test: id to collide",
                key: "DDcollide",
                status: 'active'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                cleanup.ids.push(doc._id);
                doc._id.should.be.an.Object();

                // Now try creating a duplicate to test the error
                fauxService._create({
                    _id: doc._id,
                    name: "unit test: this doc should not get saved",
                    key: "DDcollide",
                    status: 'active'
                }, (err, doc) => {
                    should(err).be.ok();
                    should(doc).not.be.ok();

                    done();
                });
            });
        });

        it("doesn't need a callback", done => {
            // Create a document
            const id = new ObjectId();
            fauxService._create({
                _id: id,
                name: "unit test: forget the callback",
                key: app.services.doodad.generateKey(),
                status: 'active'
            });

            // Since we set the id, we can clean it up.
            cleanup.ids.push(id);

            setTimeout(() => {
                done();
            }, 10);
        });
    });

    describe('_createWithRetry', () => {
        it('actually works on collision, stops on max attempts and can succeed)', done => {

            // Create a document that will serve as the existing one to test collisions
            fauxService._create({
                name: "unit test: id to collide",
                key: "DDcollide2",
                status: 'active'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                cleanup.ids.push(doc._id);
                doc._id.should.be.an.Object();
                const id = doc._id;

                let tries = 0;

                // Now try the retry handler
                fauxService._createWithRetry({
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

                }, (err, doc) => {
                    should(err).be.ok();
                    should(doc).not.be.ok();

                    // Now do it again, but this time let the closure fix the record to let it succeed
                    // Now try the retry handler
                    fauxService._createWithRetry({
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

                    }, (err, doc) => {
                        should(err).not.be.ok();
                        should(doc).be.ok();

                        cleanup.ids.push(doc._id);
                        doc._id.should.be.an.Object();

                        done();
                    });
                });
            });
        });


        it("doesn't need a callback", done => {
            // Create a document
            const id = new ObjectId();
            fauxService._createWithRetry({}, () => ({
                _id: id,
                name: "unit test: forget the callback",
                key: app.services.doodad.generateKey(),
                status: 'active'
            }));

            // Since we set the id, we can clean it up.
            cleanup.ids.push(id);

            setTimeout(() => {
                done();
            }, 10);
        });
    });

    describe('_retrieve', () => {
        it('calls back with nothing when no id is given', done => {
            fauxService._retrieve(undefined, (err, doc) => {
                should(err).not.be.ok();
                should(doc).not.be.ok();
                done();
            });
        });

        // retrieve doesn't need a callback when no id is given
        it('does not need a callback', done => {
            fauxService._retrieve();
            fauxService._retrieve(12345);

            setTimeout(() => {
                done();
            }, 10);
        });

        it('does not retrieve dead resources', done => {
            fauxService._create({
                name: "unit test: dead no retrieve",
                key: "DDdead1",
                status: 'dead'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                cleanup.ids.push(doc._id);
                doc._id.should.be.an.Object();

                // Should not return
                fauxService._retrieve(doc._id, (err, doc) => {
                    should(err).not.be.ok();
                    should(doc).be.exactly(null);

                    done();
                });
            });
        });

        it('can retrieve dead resources if concealment is off', done => {

            // turn off concealment
            fauxService._concealDeadResources = false;

            fauxService._create({
                name: "unit test: dead no retrieve",
                key: "DDdead2",
                status: 'dead'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                cleanup.ids.push(doc._id);
                doc._id.should.be.an.Object();

                // Should not return
                fauxService._retrieve(doc._id, (err, doc) => {
                    should(err).not.be.ok();
                    should(doc).be.ok();
                    doc.key.should.equal('DDdead2');

                    // turn concealment back on
                    fauxService._concealDeadResources = true;

                    done();
                });
            });
        });
    });

    describe('_find', () => {

        // Create a set of doodads to search on
        before(done => {

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

            async.each(doodads, (doodad, cb) => {
                fauxService._create(doodad, (err, doc) => {
                    // if (err) { console.error('FAILED TO SETUP DOODADS FOR _find TEST!', err) }
                    if (doc) {
                        cleanup.ids.push(doc._id);
                    }
                    cb();
                });
            }, done)

        });


        it('does not need options', done => {
            const q = fauxService._find({name: /^unit test: find/}, (err, docs) => {
                should(err).not.be.ok();
                should(docs).be.an.Array();

                docs.length.should.be.equal(3);

                done();
            });

            // Should return a query object
            q.should.be.an.Object();
        });


        it('does not return dead resources (merge status)', done => {
            const q = fauxService._find({name: /^unit test: find/, status: "pending"}, (err, docs) => {
                should(err).not.be.ok();
                should(docs).be.an.Array();

                docs.length.should.be.equal(1);

                done();
            });

            // Should return a query object
            q.should.be.an.Object();
        });

        it('does not return dead resources (merge $and status)', done => {
            const q = fauxService._find({$and: [{name: /^unit test: find/}], status: "pending"}, (err, docs) => {
                should(err).not.be.ok();
                should(docs).be.an.Array();

                docs.length.should.be.equal(1);

                done();
            });

            // Should return a query object
            q.should.be.an.Object();
        });

        it('does return dead resources when overridden', done => {
            const q = fauxService._find({name: /^unit test: find/}, {conceal: false}, (err, docs) => {
                should(err).not.be.ok();
                should(docs).be.an.Array();

                docs.length.should.be.equal(4);

                done();
            });

            // Should return a query object
            q.should.be.an.Object();
        });


        it('does not need a callback', done => {
            fauxService._find();
            setTimeout(done, 10);
        });


        it('handles pagination, sort, fields, and other options', done => {
            fauxService._find({
                name: /^unit test: find/
            }, {
                skip: 1,
                take: 1,
                sort: { created: -1, _id: -1 },
                fields: "name created"
            }, (err, docs) => {
                should(err).not.be.ok();
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
                fauxService._find({
                    name: /^unit test: find/
                }, {
                    skip: 2,
                    take: 1,
                    sort: { created: -1, _id: -1 },
                    fields: "name created",
                    comment: 'unit test cursor'
                }, (err, docs) => {
                    should(err).not.be.ok();
                    should(docs).be.an.Array();

                    docs.length.should.be.equal(1);
                    docs[0].name.should.match(/A$/);

                    done();

                });
            });
        });


        it('will not exec if told not to', done => {
            const q = fauxService._buildQuery({name: /^unit test: find/}, {exec: false});

            // Should return a query object
            q.should.be.an.Object();
            q.exec((err, docs) => {
                should(err).not.be.ok();
                should(docs).be.an.Array();

                docs.length.should.be.equal(3);

                done();
            });
        });


        it('will report errors', done => {
            fauxService._find({_things: { $in: "nope" }}, (err, docs) => {
                should(err).be.ok();
                // console.log(err);
                err.code.should.be.greaterThan(0); // this was 17287 in mongo 3.2, in 3.5 it's now just 2 ¯\_(ツ)_/¯

                should(docs).be.not.ok();

                done();
            });
        });
    });

    describe('_update', () => {
        it('applies data props` correctly', done => {
            fauxService._create({
                name: "unit test: update me ",
                key: app.services.doodad.generateKey(),
                status: 'active'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                cleanup.ids.push(doc._id);
                doc._id.should.be.an.Object();

                // Allow name to get copied
                fauxService._modifiableKeys = ['name'];

                // Now change it
                fauxService._update(doc, {
                    name: "unit test: updated!"
                }, (err, doc) => {
                    should(err).not.be.ok();
                    should(doc).be.ok();

                    doc.name.should.be.equal("unit test: updated!");

                    done();
                });
            });
        });

        it('is not dirty if nothing changed', done => {
            fauxService._create({
                name: "unit test: update me",
                key: app.services.doodad.generateKey(),
                status: 'active'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                cleanup.ids.push(doc._id);
                doc._id.should.be.an.Object();

                // Now change it
                fauxService._update(doc, {
                    nope: "unit test: updated!"
                }, (err, doc) => {
                    should(err).not.be.ok();
                    should(doc).be.ok();

                    should(doc.nope).not.be.ok();

                    done();
                });
            });
        });


        it('does not need a callback', done => {
            fauxService._create({
                name: "unit test: update me no cb",
                key: app.services.doodad.generateKey(),
                status: 'active'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                cleanup.ids.push(doc._id);
                doc._id.should.be.an.Object();

                // Now change it
                fauxService._update(doc, {
                    nope: "unit test: updated!"
                });

                setTimeout(done, 10);
            });
        });


        it('reports on error', done => {

            // Create a doodad
            fauxService._create({
                name: "unit test: update for delete 1",
                key: app.services.doodad.generateKey(),
                status: 'active'
            }, (err, doc1) => {
                should(err).not.be.ok();
                should(doc1).be.ok();

                cleanup.ids.push(doc1._id);
                doc1._id.should.be.an.Object();

                // Create a second doodad
                fauxService._create({
                    name: "unit test: update for delete 2",
                    key: app.services.doodad.generateKey(),
                    status: 'active'
                }, (err, doc2) => {
                    should(err).not.be.ok();
                    should(doc2).be.ok();

                    cleanup.ids.push(doc2._id);
                    doc2._id.should.be.an.Object();

                    // Update the second doodad to have the same DD as the first - should result in an error
                    doc2.key = doc1.key;

                    fauxService._update(doc2, (err, doc) => {
                        should(err).be.ok();
                        should(doc).not.be.ok();

                        done();
                    });
                });
            });
        });
    });

    describe('_delete', () => {
        it('changes status to dead', done => {
            fauxService._create({
                name: "unit test: delete me",
                key: app.services.doodad.generateKey(),
                status: 'active'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                cleanup.ids.push(doc._id);
                doc._id.should.be.an.Object();

                doc.status.should.be.equal('active');

                // Now "delete" it
                fauxService._delete(doc, (err, doc) => {
                    should(err).not.be.ok();
                    should(doc).be.ok();

                    doc.status.should.be.equal('dead');

                    done();
                });
            });
        });
    });

    describe('_deletePermanently', () => {
        it('works as intended', (done) => {
            fauxService._create({
                name: "unit test: delete me really dead",
                key: app.services.doodad.generateKey(),
                status: 'active'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                // Now kill it
                fauxService._deletePermanently(doc, (err, doc) => {
                    should(err).not.be.ok();
                    should(doc).be.ok();

                    fauxService._retrieve(doc._id, (err, doc) => {
                        should(err).not.be.ok();
                        should(doc).be.exactly(null);

                        done();
                    });
                });
            });
        });

        it('works without a callback', (done) => {
            fauxService._create({
                name: "unit test: delete me really really dead",
                key: app.services.doodad.generateKey(),
                status: 'active'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                // Now kill it
                fauxService._deletePermanently(doc);

                // Wait a hundredth of a sec
                setTimeout(() => {
                    fauxService._retrieve(doc._id, (err, doc) => {
                        should(err).not.be.ok();
                        should(doc).be.exactly(null);

                        done();
                    });
                }, 10);
            });
        });
    });

    describe('_count', () => {
        it('works as intended', (done) => {
            fauxService._create({
                name: "unit test: delete me really dead",
                key: app.services.doodad.generateKey(),
                status: 'active'
            }, (err, doc) => {
                should(err).not.be.ok();
                should(doc).be.ok();

                cleanup.ids.push(doc._id);

                // Now count it
                fauxService._count({ name: /unit test/ }, (err, count) => {
                    should(err).not.be.ok();
                    should(count).be.a.Number().and.greaterThan(0);

                    const firstCount = count;

                    // Now count it with options
                    fauxService._count({ name: /unit test/ }, {}, (err, count) => {
                        should(err).not.be.ok();

                        firstCount.should.be.exactly(count);

                        // Now count it with shitty options
                        fauxService._count({ name: /unit test/ }, null, (err, count) => {
                            should(err).not.be.ok();

                            firstCount.should.be.exactly(count);

                            done();
                        });

                    });

                });
            });
        });
    });

});
