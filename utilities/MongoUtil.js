// Require dependencies
const MongoClient = require('mongodb').MongoClient;

// Create a connect function to connect to database
async function connect(mongoUri, dbName) {
    // MongoClient.connect takes in 2 arguments:
    // 1. the connection string (MongoUri)
    // 2. an options object
    const Client = await MongoClient.connect(mongoUri, {
        'useUnifiedTopology': true
    });

    // Connect to database
    const db = Client.db(dbName);
    console.log('Database connected.');
    
    return db; // -> return the connected database for use in other JS files
}

// Export connect function for use in other JS files
module.exports = {
    connect
};