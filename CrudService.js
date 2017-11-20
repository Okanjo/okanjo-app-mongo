"use strict";

/**
 * Base service that all object CRUD services should inherit
 */
class CrudService {
    /**
     * Constructor
     * @param app
     * @param model
     */
    constructor(app, model) {
        // Make sure we're not going to have problems
        //assert(typeof model === "function", 'Model given is not an model function!');
        //assert(model.base === Mongoose, 'Model given is not a mongoose model!');

        // Hold a reference to the app
        // this.app = app;

        Object.defineProperty(this, 'app', {
            enumerable: false,
            value: app
        });

        /**
         * @type {Mongoose#Model}
         */
        this.model = model;

        /**
         * Base number of times that
         * @type {number}
         * @protected
         */
        this._createRetryCount = 3;

        /**
         * Model keys that can be updated via ._update(model, data)
         * @type {Array}
         * @protected
         */
        this._modifiableKeys = [];

        /**
         * The status to set models to when "deleted"
         * @type {string}
         * @protected
         */
        this._deletedStatus = 'dead';

        /**
         * Whether to actively prevent dead resources from returning in find and retrieve calls
         * @type {boolean}
         * @private
         */
        this._concealDeadResources = true;
    }

    /**
     * Creates a new model
     * @param {*} data – Model properties
     * @param {function(err:Error, obj:Model)} [callback] – Fired when saved or failed to save
     * @param {boolean} [suppressCollisionError] - Option to suppress error reporting on collisions (for quiet retry handling)
     * @protected
     */
    _create(data, callback, suppressCollisionError) {
        const doc = new this.model(data);

        doc.save((function(err, savedObj) {
            if (err) {
                if (!suppressCollisionError || err.code !== CrudService._collisionErrorCode) {
                    this.app.report('Failed to create new model: ' + this.model.modelName, err, data);
                }
            }
            if (callback) callback(err, savedObj);
        }).bind(this));
    }

    /**
     * Creates a new model but calls the objectClosure function before each save attempt
     * @param {*} data – Model properties
     * @param {function(data:*,attempt:Number)} objectClosure - Called to obtain the object model properties before save
     * @param {function(err:Error, obj:Model)} [callback] – Fired when saved or failed to save
     * @param {Number} [attempt] - Internal, used if the save attempt failed due to a collision
     * @protected
     */
    _createWithRetry(data, objectClosure, callback, attempt) {
        attempt = attempt || 0;
        this._create(objectClosure(data, attempt), (function(err, doc) {
            // Only retry if the error matches our known error code
            if (err && err.code === CrudService._collisionErrorCode) {
                if (++attempt >= this._createRetryCount) {
                    // Report here because we told _create not to report collisions
                    this.app.report('All attempts failed to create model due to collisions! Model: ' + this.model.modelName, { err, data });
                    /* istanbul ignore else: fuck you debbie */
                    if (callback) callback(err);
                } else {
                    // Try, try again, Mr. Kidd
                    process.nextTick(this._createWithRetry.bind(this, data, objectClosure, callback, attempt));
                }
            } else {
                if (callback) callback(err, doc);
            }
        }).bind(this), true);
    }

    /**
     * Retrieves a model given an identifier.
     *
     * WARNING: this _can_ retrieve dead statuses
     *
     * @param {ObjectId|string} id - ObjectId or convertible identifier
     * @param {function(err:Error, doc:Model)} [callback] – Fired when completed
     * @protected
     */
    _retrieve(id, callback) {

        // Only do a query if there's something to query for
        const objectId = this.app.dbs.getObjectId(id);
        const criteria = {_id: objectId};

        if (objectId) {

            // If conceal mode is activated, prevent dead resources from returning
            if (this._concealDeadResources) criteria.status = { $ne: this._deletedStatus };

            // Do the query - with next to no customization abilities
            this.model.findOne(criteria).exec((function(err, doc) {
                /* istanbul ignore if: this should be next to impossible to trigger */
                if (err) this.app.report('Failed to retrieve model: '+this.model.modelName, err, id, objectId);
                if (callback) callback(err, doc);
            }).bind(this));

        } else {
            // id has no value - so... womp.
            if (callback) callback(null, null);
        }
    }

    /**
     * Retrieves one or more models that match the given criteria
     * @param {*} criteria - Filter criteria
     * @param {{[skip]:number, [take]:number, [fields]:string|*, [sort]:*, [exec]:boolean}} [options] - Query options
     * @param {function(err:Error, docs:[Model])} [callback] – Fired when completed
     * @return {Query}
     * @protected
     */
    _find(criteria, options, callback) {

        // Allow overloading by skipping options
        if (typeof options === "function") {
            callback = options;
            options = {};
        } else {
            // Default options
            options = options || {};
        }

        // Strip options out so we can stick them into the query builder
        let skip, limit, fields, sort, query, exec = true, conceal = true;
        if (options.skip !== undefined) { skip = options.skip; delete options.skip; }
        if (options.take !== undefined) { limit = options.take; delete options.take; }
        if (options.fields !== undefined) { fields = options.fields; delete options.fields; }
        if (options.sort !== undefined) { sort = options.sort; delete options.sort; }
        if (options.exec !== undefined) { exec = options.exec; delete options.exec; }
        if (options.conceal !== undefined) { conceal = options.conceal; delete options.conceal; }

        // Actively prevent dead resources from returning, even if a status was given
        if (this._concealDeadResources && conceal) {

            // Define the dead filter, which will be used in multiple circumstances
            const deadFilter = { status: { $ne: this._deletedStatus } };

            // Check if we were even given criteria
            if (criteria) {

                // Check if we were given a status filter
                if (criteria.status) {

                    //
                    // Composite both status requirements together
                    //

                    // Make the composite and conditions
                    const compositeConditions = [
                        { status: criteria.status }, // Theirs
                        deadFilter // Ours
                    ];

                    // Remove the original status filter from criteria
                    delete criteria.status;

                    // Merge the and criteria to the query
                    if (criteria.$and) {
                        // There already is an $and operator, so add our conditions to it
                        criteria.$and = criteria.$and.concat(compositeConditions);
                    } else {
                        // No and yet - just set it
                        criteria.$and = compositeConditions;
                    }

                } else {
                    // No status given, default it to conceal dead things
                    criteria.status = deadFilter.status;
                }
            } else {
                // No criteria given, default it to conceal dead things
                criteria = deadFilter;
            }
        }

        // Build the query
        query = this.model.find(criteria);

        // Add query options to the builder if present
        if (skip !== undefined) { query = query.skip(skip); }
        if (limit !== undefined) { query = query.limit(limit); }
        if (fields !== undefined) { query = query.select(fields); }
        if (sort !== undefined) { query = query.sort(sort); }
        if (Object.keys(options).length > 0) { query = query.setOptions(options); }

        // By default, we'll execute now, but you could tell it not to and mangle the query yourself
        if (exec) {
            query.exec((function(err, docs) {
                if (err) {
                    this.app.report('Failed to find models: '+this.model.modelName, err, query.getQuery());
                }
                if (callback) callback(err, docs || []);
            }).bind(this));
        }

        // Return the query, so the user can make .toConstructor it or execute it themselves, or whatever!
        return query;
    }

    /**
     * Performs a find-based query but is optimized to only return the count of matching records, not the records themselves
     * @param {*} criteria - Filter criteria
     * @param {{[skip]:number, [take]:number, [fields]:string|*, [sort]:*, [exec]:boolean}} [options] - Query options
     * @param {function(err:Error, docs:[Model])} [callback] – Fired when completed
     * @return {Query}
     * @protected
     */
    _count(criteria, options, callback) {
        // Allow overloading by skipping options
        if (typeof options === "function") {
            //noinspection JSValidateTypes
            callback = options;
            options = {};
        } else {
            // Default options
            options = options || {};
        }

        // Don't execute, we want the query so we can fudge it
        options.exec = false;

        // Exec the count query
        return this._find(criteria, options).count(callback);
    }

    /**
     * Applies the data properties to the model
     * @param {*|Model} doc - Model to update
     * @param {*} [data] - Data to apply to the model before saving
     * @protected
     */
    _applyUpdates(doc, data) {
        // When given a data object, apply those keys to the model when allowed to do so
        if (data && typeof data === "object") {
            this._modifiableKeys.forEach(function (property) {
                /* istanbul ignore else: too edge casey to test this way */
                if (data.hasOwnProperty(property)) {
                    doc[property] = data[property];
                }
            });
        }
    }

    /**
     * Update an existing model
     * @param {*|Model} doc - Model to update
     * @param {*} [data] - Data to apply to the model before saving
     * @param {function(err:Error, obj:Model, wasDirty:boolean)} [callback] – Fired when saved or failed to save
     * @protected
     */
    _update(doc, data, callback) {

        // Allow overloading of _update(obj, callback)
        if (typeof data === "function") {
            callback = data;
            data = null;
        }

        // Apply any given key updates, if given
        this._applyUpdates(doc, data);

        // Let the callback know whether anything was actually dirty
        const dirty = doc.isModified();

        // Ensure when you update an object, no matter what it is, we update our auditing field
        doc.updated = new Date();
        doc.save((function(err, updatedObj) {
            if (err) {
                this.app.report('Failed to update model: '+this.model.modelName, err, doc);
            }
            if (callback) callback(err, updatedObj, dirty);
        }).bind(this));
    }

    /**
     * Fake-deletes a model from the database by changing its status to dead and updating the model
     * @param {*|Model} doc - Model to update
     * @param {function(err:Error, obj:Model)} [callback] – Fired when saved or failed to save
     * @protected
     */
    _delete(doc, callback) {
        doc.status = this._deletedStatus;
        this._update(doc, callback);
    }

    /**
     * Permanently removes a document from the collection
     * @param {Model} doc - Model to delete
     * @param {function(err:Error, obj:Model)} [callback] - Fired when deleted or failed to delete
     * @protected
     */
    _deletePermanently(doc, callback) {
        doc.remove((err, deletedDoc) => {
            /* istanbul ignore if: we're not responsible for db failures */
            if (err) {
                this.app.report('Failed to permanently remove model: '+this.model.modelName, err, doc);
            }
            if (callback) callback(err, deletedDoc);
        });
    }
}

/**
 * Mongo collision error code
 * @type {number}
 * @static
 * @private
 */
CrudService._collisionErrorCode = 11000;

module.exports = CrudService;
