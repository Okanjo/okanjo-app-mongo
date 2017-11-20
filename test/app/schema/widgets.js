
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