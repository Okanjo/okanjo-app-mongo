"use strict";

const EventEmitter = require('events').EventEmitter;
const Mongoose = require('mongoose');
const BaseId = require('base-id');
const ObjectId = Mongoose.Types.ObjectId;

// Hey mongoose, shut the hell up, ok?
// http://mongoosejs.com/docs/promises.html
Mongoose.Promise = global.Promise;

Mongoose.set('useCreateIndex', true);


/**
 * Multi-database manager for Mongoose/MongoDB
 * Keeps track of multiple database connection states and reports health on all.
 *
 * @extends EventEmitter
 */
class MongoService extends EventEmitter {
    constructor(app, config) {
        super();

        this.app = app;

        // Find the configuration
        this.config = config || app.config.mongo || {};

        // Create or use app object prefixes { obj_type: 'prefix' }
        this.prefixes = this.config.prefixes || this.app.prefixes || {};

        // Create or use app object aliases { obj_type: 'old prefix' }
        this.prefixAliases = this.config.prefixAliases || this.app.prefixAliases || {};

        this._expectedConnectionReadies = 1;
        this._dbStates = {};
        this._dbConnections = {};

        // Register the connection with the app
        app._serviceConnectors.push((cb) => {

            // Do the connection
            this.connect();
            this.once('health_change', (state) => {
                /* istanbul ignore else: too hard to edge case this with unit tests and docker */
                // If the callback has not been fired, then we're ready now!
                if (state && cb) {
                    cb();
                }
            });

            /* istanbul ignore if: too hard to edge case this with unit tests and docker */
            // If the connection is already established, the health_change might not flip, so callback now if we're already good
            if (this.getHealthStatus()) {
                cb();
                cb = null;
            }
        });
    }

    /**
     * Connects to all of the given mongoDB db schemas
     * @returns {MongoService}
     */
    connect() {

        // Get the schemas
        const schemas = this.config.schemas || [];
        this._expectedConnectionReadies = schemas.length;

        // Warn if the service was loaded with no schemas
        if (schemas.length === 0) {
            this.app.log('Warning: no MongoService schemas defined!');
            this.app.log('App will hang since no connection to Mongo will be made...');
        }

        schemas.forEach((schema) => {
            if (typeof schema !== 'object' ||
                !schema.name ||
                !schema.path ||
                !schema.uri) {
                throw new Error('MongoService schema definition must be an object with keys: name, path and uri.');
            } else {
                this._connectSchema(schema);
            }
        });

        return this;
    }

    /**
     * Gets the current health situation of all connections
     * @returns {boolean}
     */
    getHealthStatus() {
        let readies = 0;

        // Check each state and return false if at least one is unhealthy
        Object.keys(this._dbStates).forEach((schemaName) => {
            /* istanbul ignore else: would require edge casing docker connection states */
            // Check the health of the schema
            if (this._dbStates[schemaName]) {
                readies++;
            }
        });

        // Report unhealthy if not all the expected connections are ready yet
        return readies === this._expectedConnectionReadies;
    }

    /**
     * Converts an identifier into an ObjectId instance
     * @param mixed_id
     * @return {*}
     */
    getObjectId(mixed_id) {
        try {
            if (mixed_id instanceof ObjectId) {
                return mixed_id;
            } else {
                const comparableId = this.getComparableId(mixed_id);
                if (ObjectId.isValid(comparableId)) {
                    return new ObjectId(comparableId);
                }
            }
        } catch(e) {
            /* istanbul ignore next: the isValid check should prevent any exceptions but just be really safe since this has been unstable in the past */
            this.app.report('Warning: could not convert value to ObjectId', mixed_id, e);
        }
        return null;
    }

    /**
     * Converts an identifier to a comparable, hex-string version of an ObjectId
     * @param {*} mixed_id – An ObjectId, base-58 encoded id, or a plain old hex string
     * @return {string|null}
     */
    getComparableId(mixed_id) {

        // Convert ObjectIds to strings for comparison
        if (mixed_id instanceof ObjectId) {
            return mixed_id.toString();
        }

        // Try to match a known prefix
        if (typeof mixed_id === "string") {

            // Check if the key matches the underscore style
            const match = MongoService._identifierParser.exec(mixed_id);
            let prefix;
            if (match !== null) {

                // match[1] contains the object prefix
                // match[2] contains the meta prefix (e.g. environment)
                // match[3] contains the actual identifier
                prefix = match[1];

                // If there exists a registered prefix in app, then decode it
                if (Object.keys(this.prefixes).find((key) => this.prefixes[key] === prefix)) {
                    return BaseId.base58.decode(match[3]).toLowerCase();
                }

            } else {

                // Try to handle backwards compatibility of old ID format (two letter prefix)
                prefix = mixed_id.length >= 2 ? mixed_id.substr(0, 2) : '';
                if (prefix !== '') {

                    // If there exists a registered prefix in app, then decode it
                    if (Object.keys(this.prefixAliases).find((key) => this.prefixAliases[key] === prefix)) {
                        return BaseId.base58.decodeWithPrefix(mixed_id, prefix).toLowerCase();
                    }
                }
            }
        }

        // Return as-is because no valid prefix detected, or value is not comparable
        return mixed_id;
    }

    /**
     * Compares the given ids for equality
     * @param {*} a - Mixed id type
     * @param {*} b - Mixed id type
     * @return {boolean}
     */
    compareIds(a, b) {
        return this.getComparableId(a) === this.getComparableId(b);
    }

    //noinspection JSMethodCanBeStatic
    /**
     * Returns whether the given object is a Mongoose model
     * @param mixed
     * @return {boolean}
     */
    isModel(mixed) {
        return mixed.$isMongooseModelPrototype === true;
    }

    /**
     * Returns the current environment to attach to an id prefix
     * @return {*}
     */
    getEnvironmentIdPrefix() {
        if (this.app.currentEnvironment === "default") {
            return "local_";
        } else if (this.app.currentEnvironment === "production") {
            return "";
        } else {
            return this.app.currentEnvironment + "_";
        }
    }

    /**
     * Encodes an identifier for public consumption
     * @param id
     * @param prefix
     * @return {String}
     */
    getPublicId(id, prefix) {
        if (!prefix) {
            this.app.report('Why would you not prefix a public id?', id, prefix);
            prefix = "derp";
        }
        prefix += "_" + this.getEnvironmentIdPrefix();
        return BaseId.base58.encodeWithPrefix(id, prefix);
    }

    /**
     * Handles the event when a mongoose connection fully opens
     * @param {string} schemaName – The schema name that opened
     * @private
     */
    _onConnectionOpen(schemaName) {
        const currentState = this.getHealthStatus();

        this._dbStates[schemaName] = true;
        const newState = this.getHealthStatus();

        /* istanbul ignore else: out of scope to disconnect here */
        if (newState !== currentState) {
            process.nextTick(this.emit.bind(this, 'health_change', newState));
        }
    }

    /* istanbul ignore next: would require edge casing docker connection states */
    /**
     * Attempt to reconnect to a schema
     * @param schemaName
     * @private
     */
    _handleReconnect(schemaName) {
        const connection = this._dbConnections[schemaName];

        // Since the connection should have already been setup, let's cheat and try to open it again
        connection._open();
    }

    /* istanbul ignore next: would require edge casing docker connection states */
    /**
     * Handles the event when a mongoose connection dies
     * @param {string} schemaName - The schema name that errored
     * @param {Error} err - I'm assuming this is an error
     * @private
     */
    _onConnectionError(schemaName, err) {
        const currentState = this.getHealthStatus(),
            connection = this._dbConnections[schemaName];

        this.app.report('MongoDB connection problem! Retrying...', err);

        // Try reconnection in 5 seconds
        if (connection.readyState === Mongoose.STATES.disconnected) {
            setTimeout(this._handleReconnect.bind(this, schemaName), 5000);
        }

        // Set the schema state to dead
        this._dbStates[schemaName] = false;
        const newState = this.getHealthStatus();

        // Notify if manager changed states
        if (newState !== currentState) {
            process.nextTick(this.emit.bind(this, 'health_change', newState));
        }
    }

    /* istanbul ignore next: would require edge casing docker connection states */
    //noinspection JSMethodCanBeStatic
    /**
     * Handles the event when mongoose reconnects to the server
     * @param schemaName - The schema name that reconnected
     * @private
     */
    _onReconnection(schemaName) {
        this.app.log(' >> Reconnected to MongoDB: ' + schemaName);
    }

    /* istanbul ignore next: would require edge casing docker connection states */
    //noinspection JSMethodCanBeStatic
    /**
     * Handles the event that mongoose disconnected from the server
     * @param schemaName - The schema name that disconnected
     * @private
     */
    _onDisconnection(schemaName) {
        this.app.log(' !! Disconnected from MongoDB: ' + schemaName);
    }

    /**
     * Establishes the mongoose connection and binds the mongoose schema to the given connection
     * @param {object} schema - Schema configuration
     * @private
     */
    _connectSchema(schema) {

        const schemaName = schema.name;
        const uri = schema.uri;
        const schemaPath = schema.path;

        let connection, models;

        // Create the connection
        connection = this._dbConnections[schemaName] = Mongoose.createConnection(uri, {
            useNewUrlParser: true,
            keepAlive: true
        }); // this will automatically open the connection

        // Bind the schema to the connection
        models = require(schemaPath)(connection, this.app);

        // Set the property on the database class as the name of the schema, so you can do `new app.dbs.schemaName.YourModel()` or whatever
        this[schemaName] = models;

        // Register connection events
        connection
            .on("open", this._onConnectionOpen.bind(this, schemaName))
            .on("error", this._onConnectionError.bind(this, schemaName))
            .on("reconnected", this._onReconnection.bind(this, schemaName))
            .on("disconnected", this._onDisconnection.bind(this, schemaName));
    }
}

/**
 * Matches parts a public identifier string
 * @type {RegExp}
 * @static
 */
MongoService._identifierParser = /^([a-z]+)_([a-z_]*?)_?([^_]+)$/i;

module.exports = MongoService;