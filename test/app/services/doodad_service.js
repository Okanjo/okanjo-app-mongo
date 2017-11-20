"use strict";

const CrudService = require('../../../CrudService');
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

        // Easy access to class enumeration
        this.status = DoodadService.status;

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
                status: this.status.active,
                account_id: data.account_id
            };
        }, callback);
    }


    // noinspection JSUnusedGlobalSymbols
    /**
     * Retrieves a Key given an identifier
     * @param {ObjectId|string} id - ObjectId or convertible identifier
     * @param {function(err:Error, doc:Model)} [callback] – Fired when completed
     */
    retrieve(id, callback) {
        this._retrieve(id, callback);
    }


    // noinspection JSUnusedGlobalSymbols
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



    // noinspection JSUnusedGlobalSymbols
    /**
     * Updates a Key model
     * @param key - Key to update
     * @param {*} [data] - Data to apply to the model before saving
     * @param {function(err:Error, obj:Model)} [callback] – Fired when saved or failed to save
     */
    update(key, data, callback) {
        this._update(key, data, callback);
    }


    // noinspection JSUnusedGlobalSymbols
    // noinspection ReservedWordAsName
    // noinspection JSUnusedGlobalSymbols
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