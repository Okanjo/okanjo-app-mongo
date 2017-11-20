# Okanjo MongoDB Service

[![Build Status](https://travis-ci.org/Okanjo/okanjo-app-mongo.svg?branch=master)](https://travis-ci.org/Okanjo/okanjo-app-mongo) [![Coverage Status](https://coveralls.io/repos/github/Okanjo/okanjo-app-mongo/badge.svg?branch=master)](https://coveralls.io/github/Okanjo/okanjo-app-mongo?branch=master)

Service for interfacing with MongoDB for the Okanjo App ecosystem.

This package:

* Uses Mongoose for object modeling 
* Manages connectivity and reconnection edge cases
* Can manage multiple schemas, even on separate hosts
* Provides a reusable CRUD service, useful for extending model services 
* Packs a bunch of useful utility functions

## Installing

Add to your project like so: 

```sh
npm install okanjo-app-mongo
```

Note: requires the [`okanjo-app`](https://github.com/okanjo/okanjo-app) module.

## Example Usage

Here's an example app:

* `example-app`
  * `schemas/`
    * `widgets.js`
  * `services/`
    * `DoodadService.js`
  * `config.js`
  * `index.js`

### `example-app/schemas/widgets.js`
This file contains the Mongoose model definitions and exports a function for MongoService to use when connecting.
```js
"use strict";

const Mongoose = require('mongoose');
const schema = {};


schema.doodad = new Mongoose.Schema({
    name: String,
    key: { type: String, index: { unique: true, dropDups: true } },

    status: { type: String, index: true },
    owner: { type: Mongoose.Schema.Types.ObjectId, index: true },

    created: { type: Date, default: Date.now, index: true },
    updated: { type: Date, default: null }
});


module.exports = function(connection/*, app*/) {
    return {
        Doodad: connection.model('doodad', schema.doodad)
    }
};
```

### `example-app/services/DoodadService.js`
This is an example of using CrudService as a base for model services. You could add your business logic and other model-related
functions to this class.
```js
"use strict";

const CrudService = require('okanjo-app-mongo/CrudService');
const BaseId = require('base-id');

/**
 * Doodad Service Example
 */
class DoodadService extends CrudService {

    /**
     * Doodad constructor
     * @param {OkanjoApp} app -
     */
    constructor(app) {
        super(app, null);

        this._modifiableKeys = ['name'];
        this._concealDeadResources = false;

        app.once('ready', () => this.model = app.dbs.widgets.Doodad);
    }


    /**
     * Generates an new Doodad key string
     * @return {String}
     */
    generateKey() {
        return BaseId.base62.generateToken(10, "doodad_" + this.app.dbs.getEnvironmentIdPrefix());
    }


    // Expose and wrap CRUD functions ----


    /**
     * Creates a new Key model
     * @param {*} data – Model properties
     * @param {function(err:Error,obj:Model)} callback - Callback to fire when complete
     */
    create(data, callback) {
        // keys are unique so use _createWithRetry instead of _create
        this._createWithRetry(data, (data) => {
            return {
                name: data.name || "",
                key: this.generateKey(),
                status: DoodadService.status.active,
                account_id: data.account_id
            };
        }, callback);
    }


    /**
     * Retrieves a Key given an identifier
     * @param {ObjectId|string} id - ObjectId or convertible identifier
     * @param {function(err:Error, doc:Model)} [callback] – Fired when completed
     */
    retrieve(id, callback) {
        this._retrieve(id, callback);
    }


    /**
     * Retrieves one or more keys that match the given criteria
     * @param {*} criteria - Filter criteria
     * @param {{[skip]:number, [take]:number, [fields]:string|*, [sort]:*, [exec]:boolean}} [options] - Query options
     * @param {function(err:Error, docs:[Model])} [callback] – Fired when completed
     * @return {Query}
     */
    find(criteria, options, callback) {
        this._find(criteria, options, callback);
    }



    /**
     * Updates a Key model
     * @param key - Key to update
     * @param {*} [data] - Data to apply to the model before saving
     * @param {function(err:Error, obj:Model)} [callback] – Fired when saved or failed to save
     */
    update(key, data, callback) {
        this._update(key, data, callback);
    }


    /**
     * Deletes a key model (make dead)
     * @param key - Key to update
     * @param {function(err:Error, obj:Model)} [callback] – Fired when saved or failed to save
     */
    delete(key, callback) {
        this._delete(key, callback);
    }


    /**
     * Formats a Key or an array of Key models for public consumption
     * @param {[Model]|Model} mixed - Key or array of Keys
     */
    formatForResponse(mixed) {
        return this.app.response.formatForResponse(mixed, (obj) => {
            return {
                id: this.app.mongo.getPublicId(obj._id, this.app.prefixes.doodad),
                name: obj.name,
                key: obj.key
            };
        });
    }
}

/**
 * Status enumeration
 * @type {{dead: string, active: string}}
 */
DoodadService.status = {
    dead: "dead",
    active: "active"
};


module.exports = DoodadService;
```

### `example-app/config.js`
Typical OkanjoApp configuration file, containing the mongo config
```js
"use strict";

const Path = require('path');

// this is just for making running the example across platforms easy
// you generally won't need this line
const host = process.env.MONGO_HOST || '192.168.99.100:9010';

module.exports = {
    mongo: {
        schemas: [
            {
                name: 'widgets',
                path: Path.join(__dirname, 'schemas', 'widgets.js'),
                uri: `mongodb://${host}/unittest_widgets`
            }
        ]
    }
};
```

### `index.js`
Example application that will connect, create a doc, and find the doc.
```js
"use strict";

const OkanjoApp = require('okanjo-app');
const MongoService = require('okanjo-app-mongo');

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

            app.inspect('Created doodad', doc.toObject());

            // Example: use the direct Mongoose model to find the doc
            app.dbs.widgets.Doodad.find({ _id: doc._id }, (err, docs) => {
                if (err) {
                    app.report('Blew up retrieving doodads', err);
                    process.exit(2);
                } else {

                    app.inspect('Retrieved doodads', docs.map((d) => d.toObject()));

                    console.log('Done!');
                    process.exit(0);
                }
            });

        }
    });
});
```

A runnable version of this application can be found in [docs/example-app](https://github.com/okanjo/okanjo-app-mongo/tree/master/docs/example-app).

# MongoService

MongoDB management class. Must be instantiated to be used.

## Properties
* `mongo.app` – (read-only) The OkanjoApp instance provided when constructed
* `mongo.config` – (read-only) The mongo service configuration provided when constructed
* `mongo.prefixes` – Object identifier prefixes
* `mongo.prefixAliases` – Old Object identifier prefixes that map to a new one
* `mongo[schemaName]` – Each connected schema will load its Mongoose models here. Just don't name your schema the same as any class property or method! 

## Methods

### `new MongoService(app, [config])`
Creates a new mongo service instance.
* `app` – The OkanjoApp instance to bind to
* `config` – (Optional) The mongo service configuration object. Defaults to app.config.mongo if not provided.
  * `config.prefixes` – Optional mappings for pretty ids, where the key maps to the prefix. E.g. `{ "thing": "tng", "product", "pr" }`
  * `config.prefixAliases` – Optional aliases for mappings, where the key matches the prefixes key and the value is the old or aliased prefix. Useful for migrating from an old id prefix scheme to a new one.
  * `config.schemas` – Optional array of schema connections.
    * `config.schemas[].name` – Required reference name of the schema. It will be added as a property of the class when connected. E.g. "widgets"
    * `config.schemas[].uri` – Required connection URI for mongodb. E.g. `mongodb://host:port/databasename`
    * `config.schemas[].path` – Required string path that exports a function which returns the models built on the connection. `function(connection, app) { return { Model: connection.model('doodad', ...) }; }`

### `mongo.getObjectId(mixed_id)`
Returns an ObjectId from a given identifier. 
* `mixed_id` – An identifier. Can be an `ObjectId` or a `string`. If given as a string, the string may a 12-byte hexadecimal value or be a prefixed base-58 encoded value. 
 
### `mongo.compareIds(mixed_id, mixed_id)`
Returns true if the two identifiers match.
* `mixed_id` – An identifier. Can be an `ObjectId` or a `string`. If given as a string, the string may a 12-byte hexadecimal value or be a prefixed base-58 encoded value. 
 
### `mongo.isModel(obj)`
Returns whether the given object is a Mongoose model or not.
* `obj` – An object to test

### `mongo.getEnvironmentIdPrefix()`
Returns the current app environment to prefix to an id. The following environment names are handled specially:
* `default` – This is assumed to be running locally, so the prefix will be `local_`
* `production` – This is assumed to be running in a live environment, so there will be no prefix.

Anything else will be returned as is. For example, if the current app environment is `sandbox` then `sandbox_` will return.

### `mongo.getPublicId(id, prefix)`
Returns a public readable id for an ObjectId. Useful for making public identifiers readable and not entirely gibberish or generic hex values. Values will be returned with the given prefix and encoded in base-58.
* `id` – ObjectId to format
* `prefix` – Prefix describing what the identifier is for. For example, `product`. 

Note: The environment prefix will be included as well. For example, in `sandbox` environment, the returned value might look like `product_sandox_asdfasdfasdf`.
 
## Events

### `mongo.on('health_change', (newState) => { ... })`
Fired when the mongo service aggregate connection status changes.
* `newState` – Boolean whether all connections are ready or not.


## Extending and Contributing 

Our goal is quality-driven development. Please ensure that 100% of the code is covered with testing.

Before contributing pull requests, please ensure that changes are covered with unit tests, and that all are passing. 

### Testing

Before you can run the tests, you'll need a working mongodb server. We suggest using docker.

For example:

```bash
docker pull mongo:3.5
docker run -d -p 27017:27017 mongo:3.5
```

To run unit tests and code coverage:
```sh
MONGO_HOST=192.168.99.100:27017 npm run report
```

Update the `MONGO_HOST` environment var to match your docker host (e.g. 127.0.0.1, user, pass, etc)

This will perform:
* Unit tests
* Code coverage report
* Code linting

Sometimes, that's overkill to quickly test a quick change. To run just the unit tests:
 
```sh
npm test
```

or if you have mocha installed globally, you may run `mocha test` instead.
