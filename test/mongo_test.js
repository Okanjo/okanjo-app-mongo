const should = require('should');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;


describe('MongoService', function() {

    const MongoService = require('../MongoService');
    const OkanjoApp = require('okanjo-app');
    const config = require('./app/config');

    let app;

    before((done) => {
        app = new OkanjoApp(config);

        app.prefixes = {
            doodad: 'dood'
        };

        app.prefixAliases = {
            doodad: 'DD'
        };

        // Attach the mongo service instance
        app.services = {
            mongo: new MongoService(app) // no custom config, default to config.mongo
        };

        // Connect to redis (stats)
        app.connectToServices(() => {
            app.services.mongo.widgets.Doodad.should.be.a.Function();

            // purge any existing records
            app.services.mongo.widgets.Doodad.remove({}, (err) => {
                done(err);
            });
        });
    });

    it ('should handle no config whatsoever', (done) => {
        const config2 = {};

        const app2 = new OkanjoApp(config2);

        app2.services = {
            mongo: new MongoService(app2)
        };

        // Connect to redis (stats)
        app2.connectToServices(() => {
            done();
        });
    });

    it('should explode if you do not provide a valid config', () => {

        const app3 = new OkanjoApp({
            mongo: {
                schemas: [
                    "lol"
                ]
            }
        });

        new MongoService(app3);

        (() => { app3.connectToServices() }).should.throw(/definition/);

    });

    it('should take a custom config just fine', (done) => {

        const app4 = new OkanjoApp({
            custom: {
                schemas: config.mongo.schemas
            }
        });

        new MongoService(app4, app4.config.custom);

        (() => { app4.connectToServices(done) }).should.not.throw();

    });

    describe('getObjectId', function() {

        it('should return ObjectId given ObjectId', function() {
            const id = new ObjectId(),
                res = app.services.mongo.getObjectId(id);

            should(res).be.ok();
            res.should.be.an.Object();
            res.should.be.instanceof(ObjectId);
            res.should.be.exactly(id); // getObject should just pass back the object-id as-is
        });


        it('should return ObjectId given hex string', function() {
            const id = new ObjectId(),
                hex = id.toString(),
                res = app.services.mongo.getObjectId(hex);

            should(res).be.ok();
            res.should.be.an.Object();
            res.should.be.instanceof(ObjectId);
            res.toString().should.be.equal(hex);
        });


        it ('should return ObjectId given base-58-prefixed string', function() {
            const hex = '5671948e910d4a7a26790192',
                encodedId = 'DD2dcagW31wsvM2hkoB',

                res = app.services.mongo.getObjectId(encodedId);

            should(res).be.ok();
            res.should.be.an.Object();
            res.should.be.instanceof(ObjectId);
            res.toString().should.be.equal(hex);
        });


        it('should return ObjectId given a number', function() {
            const res = app.services.mongo.getObjectId(12345);

            should(res).be.ok();
            res.should.be.an.Object();
            res.should.be.instanceof(ObjectId);
        });


        it('should return null if value is crap', function() {

            let res = app.services.mongo.getObjectId();
            should(res).be.exactly(null);

            res = app.services.mongo.getObjectId('');
            should(res).be.exactly(null);

            res = app.services.mongo.getObjectId(null);
            should(res).be.exactly(null);

            res = app.services.mongo.getObjectId({});
            should(res).be.exactly(null);

            res = app.services.mongo.getObjectId([]);
            should(res).be.exactly(null);

            res = app.services.mongo.getObjectId('nope');
            should(res).be.exactly(null);

            res = app.services.mongo.getObjectId(function(){});
            should(res).be.exactly(null);

            res = app.services.mongo.getObjectId('XX2dcagW31wsvM2hkoB'); // invalid prefix
            should(res).be.exactly(null);

        });


        it('should handle underscore public ids', function() {
            const hex = '5671948e910d4a7a26790192',
                encodedId = 'dood_2dcagW31wsvM2hkoB',

                res = app.services.mongo.getObjectId(encodedId);

            should(res).be.ok();
            res.should.be.an.Object();
            res.should.be.instanceof(ObjectId);
            res.toString().should.be.equal(hex);
        });


        it('should handle underscore public ids with metadata', function() {
            const hex = '5671948e910d4a7a26790192',
                encodedId = 'dood_test_2dcagW31wsvM2hkoB',
                encodedId2 = 'dood_bullshit_ass_public_id_2dcagW31wsvM2hkoB';
            let res = app.services.mongo.getObjectId(encodedId);

            should(res).be.ok();
            res.should.be.an.Object();
            res.should.be.instanceof(ObjectId);
            res.toString().should.be.equal(hex);

            res = app.services.mongo.getObjectId(encodedId2);

            should(res).be.ok();
            res.should.be.an.Object();
            res.should.be.instanceof(ObjectId);
            res.toString().should.be.equal(hex);


        });

    });


    describe('getComparableId', function() {

        it('should return hex given ObjectId', function() {
            const id = new ObjectId(),
                res = app.services.mongo.getComparableId(id);

            should(res).be.ok();
            res.should.be.a.String();
            res.should.be.exactly(id.toString()); // getObject should just pass back the object-id as-is
        });


        it('should return hex given a hex string', function() {
            const id = new ObjectId(),
                hex = id.toString(),
                res = app.services.mongo.getComparableId(hex);

            should(res).be.ok();
            res.should.be.a.String();
            res.should.be.equal(hex);
        });


        it('should return hex given a prefixed-base58 string', function() {
            const hex = '5671948e910d4a7a26790192',
                encodedId = 'DD2dcagW31wsvM2hkoB',
                res = app.services.mongo.getComparableId(encodedId);

            should(res).be.ok();
            res.should.be.a.String();
            res.should.be.equal(hex);
        });


        it('should return as-is with shitty prefix', function() {
            const hex = '5671948e910d4a7a26790192',
                encodedId = 'XX2dcagW31wsvM2hkoB',
                res = app.services.mongo.getComparableId(encodedId);

            should(res).be.ok();
            res.should.be.a.String();
            res.should.be.equal(encodedId);
            res.should.not.be.equal(hex);
        });


        it('should return as-is with shitty underscore prefix', function() {
            const hex = '5671948e910d4a7a26790192',
                encodedId = 'xx_2dcagW31wsvM2hkoB',
                res = app.services.mongo.getComparableId(encodedId);

            should(res).be.ok();
            res.should.be.a.String();
            res.should.be.equal(encodedId);
            res.should.not.be.equal(hex);
        });

    });

    describe('compareIds', () => {
        it('should work', () => {
            const hex = '5671948e910d4a7a26790192',
                encodedId = 'DD2dcagW31wsvM2hkoB';

            app.services.mongo.compareIds(hex, encodedId).should.be.exactly(true);
        });

        it('should fail', () => {
            const hex = '5671948e910d4a7a26790193',
                encodedId = 'DD2dcagW31wsvM2hkoB';

            app.services.mongo.compareIds(hex, encodedId).should.be.exactly(false);
        });
    });

    describe('isModel', () => {
        it('should works', () => {

            const doodad = new app.services.mongo.widgets.Doodad();

            app.services.mongo.isModel(doodad).should.be.exactly(true);
            app.services.mongo.isModel({}).should.be.exactly(false);

        });
    });


    describe('getEnvironmentPrefix', function() {

        let orig_env;

        before(function() {
            orig_env = app.currentEnvironment;
        });

        after(function() {
            app.currentEnvironment = orig_env;
        });

        it('should return the correct environment prefix', function() {

            let prefix;

            // local
            app.currentEnvironment = "default";
            prefix = app.services.mongo.getEnvironmentIdPrefix();
            prefix.should.equal("local_");

            // dev
            app.currentEnvironment = "dev";
            prefix = app.services.mongo.getEnvironmentIdPrefix();
            prefix.should.equal("dev_");

            // sandbox
            app.currentEnvironment = "sandbox";
            prefix = app.services.mongo.getEnvironmentIdPrefix();
            prefix.should.equal("sandbox_");

            // prod
            app.currentEnvironment = "production";
            prefix = app.services.mongo.getEnvironmentIdPrefix();
            prefix.should.equal("");

        });
    });


    describe('getPublicId', function() {

        let orig_env;

        before(function() {
            orig_env = app.currentEnvironment;
        });

        after(function() {
            app.currentEnvironment = orig_env;
        });


        it('should return an id with the correct environment prefix', function() {

            let id;
            const objId = new ObjectId('5671948e910d4a7a26790192'),
                objPrefix = app.prefixes.doodad,
                encodedId = '2dcagW31wsvM2hkoB';

            // local
            app.currentEnvironment = "default";
            id = app.services.mongo.getPublicId(objId, objPrefix);
            id.should.equal(objPrefix+"_local_"+encodedId);

            // dev
            app.currentEnvironment = "dev";
            id = app.services.mongo.getPublicId(objId, objPrefix);
            id.should.equal(objPrefix+"_dev_"+encodedId);

            // sandbox
            app.currentEnvironment = "sandbox";
            id = app.services.mongo.getPublicId(objId, objPrefix);
            id.should.equal(objPrefix+"_sandbox_"+encodedId);

            // prod
            app.currentEnvironment = "production";
            id = app.services.mongo.getPublicId(objId, objPrefix);
            id.should.equal(objPrefix+"_"+encodedId);

        });


        it('should yell if you screw it up', function() {

            app.currentEnvironment = "default";

            const id = app.services.mongo.getPublicId(12345);
            id.should.match(/derp_[a-z]*_4fr/);
        });

    });

});