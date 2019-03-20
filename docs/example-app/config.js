"use strict";

const Path = require('path');

// this is just for making running the example across platforms easy
// you generally won't need this line
const host = process.env.MONGO_HOST || 'localhost:9010';

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