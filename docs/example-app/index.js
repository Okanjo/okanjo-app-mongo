"use strict";

const OkanjoApp = require('okanjo-app');
// const MongoService = require('okanjo-app-mongo');
const MongoService = require('../../MongoService');

const DoodadService = require('./services/DoodadService');
const config = require('./config');

// Init the app
const app = new OkanjoApp(config);

// Add the mongo service to the app
app.dbs = new MongoService(app, config.mongo);

// Maybe you want to use CrudService for building model-based services
app.services = {
    doodad: new DoodadService(app)
};

// Start it up
app.connectToServices(() => {

    // Example: use the extended CrudService to make a new doc
    app.services.doodad.create({
        name: 'my doodad',
        account_id: 'user_1'
    }, (err, doc) => {
        if (err) {
            app.report('Blew up creating new doodad', err);
            process.exit(1);
        } else {

            app.dump('Created doodad', doc.toObject());

            // Example: use the direct Mongoose model to find the doc
            app.dbs.widgets.Doodad.find({ _id: doc._id }, (err, docs) => {
                if (err) {
                    app.report('Blew up retrieving doodads', err);
                    process.exit(2);
                } else {

                    app.dump('Retrieved doodads', docs.map((d) => d.toObject()));

                    console.log('Done!');
                    process.exit(0);
                }
            });

        }
    });
});