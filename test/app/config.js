const Path = require('path');

const host = process.env.MONGO_HOST || 'localhost:9010';

module.exports = {
    mongo: {
        schemas: [
            {
                name: 'widgets',
                path: Path.join(__dirname, 'schema', 'widgets.js'),
                uri: `mongodb://${host}/unittest_widgets`
            }
        ]
    }
};