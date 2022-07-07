// --- Setup dependencies ---
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const MongoUtil = require('./utilities/MongoUtil');
const ObjectId = require('mongodb').ObjectId;
const BcryptUtil = require('./utilities/BcryptUtil');

// --- Setup Express App ---
const app = express();

// Enable CORS
app.use(cors());

// Enable form processing
app.use(express.urlencoded({
  extended: false
}));

// Enable JSON data processing
app.use(express.json());

// --- Global variables ---
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

const DB_NAME = 'coffee_talk';
const DB_COLLECTION = {
  recipes: 'recipes',
  favorites: 'favorites',
  beans: 'beans',
  grinders: 'grinders',
  brewers: 'brewers',
  methods: 'methods'
}

// --- Main ---
async function main() {
  // Connect to database
  const db = await MongoUtil.connect(MONGO_URI, DB_NAME);

  // --- Functions ---
  async function getRecordById(collection, id) {
    const record = await db.collection(DB_COLLECTION[collection]).findOne({
      '_id': ObjectId(id)
    });
    return record;
  }

  async function populateRecipeFields(recipe) {
    // Populate beans records
    let beans = [];
    for (let beanId of recipe.coffee_beans) {
      let beanRecord = await getRecordById('beans', beanId);
      beans.push(beanRecord);
    }
    recipe.coffee_beans = beans;

    // Populate grinder record
    if (recipe.grinder) {
      recipe.grinder = await getRecordById('grinders', recipe.grinder);
    }

    // Populate brewer record
    recipe.brewer = await getRecordById('brewers', recipe.brewer);

    // Populate brewing method record
    recipe.brewing_method = await getRecordById('methods', recipe.brewing_method);
  }

  function sendDatabaseError(res) {
    res.status(500); // Internal server error
    res.json({
      status: 'error',
      message: 'Unable to communicate with database'
    });
  }

  // --- Routes ---
  app.get('/', function (req, res) {
    res.send('Welcome to CoffeeTalk API');
  });

  // Endpoint to retrieve all coffee recipes
  app.get('/recipes', async function (req, res) {
    // Get query strings 
    // Note: beans is a comma-separated string of ids
    // grinder, method, and brewer are ids
    // sort is a string that is either 'date' or 'rating'
    let { name, beans, grinder, method, brewer, rating, page, limit, sort } = req.query;

    // Initialise criteria object
    let criteria = {};

    if (name) {
      // Search for coffee recipe by name (case-insensitive)
      criteria['recipe_name'] = {
        $regex: name,
        $options: 'i'
      }
    };

    if (beans) {
      // Convert beans into array of ObjectIds
      beans = beans.split(',');
      beans = beans.map(id => ObjectId(id));

      // Filter coffee recipes by coffee beans
      criteria['coffee_beans'] = {
        $all: beans
      };
    }

    if (grinder) {
      criteria['grinder'] = {
        $eq: ObjectId(grinder)
      };
    }

    if (method) {
      criteria['brewing_method'] = {
        $eq: ObjectId(method)
      };
    }

    if (brewer) {
      criteria['brewer'] = {
        $eq: ObjectId(brewer)
      };
    }

    // Filter recipes that have average rating of at least <rating>
    if (rating) {
      // Check that rating is numeric
      if (!isNaN(rating)) {
        criteria['average_rating'] = {
          $gte: Number(rating)
        };
      }
      else {
        res.status(400); // Bad request
        res.json({
          status: 'fail',
          data: {
            rating: 'Invalid value specified for rating'
          }
        });
      }
    }

    // If page is not specified, default value is 1
    page = page ? page : 1;

    // If limit is not specified, default value is 10
    // otherwise, convert default query string value to int
    limit = limit ? parseInt(limit) : 10;

    // If sort is not specified, default is by latest date (descending order)
    // Return error message if sort is neither empty, 'date' nor 'rating'
    if (!sort || sort === 'date') {
      sortOption = {
        'date': -1
      };
    }
    else if (sort === 'rating') {
      sortOption = {
        'average_rating': -1
      }
    }
    else {
      res.status(400); // Bad request
      res.json({
        status: 'fail',
        data: {
          sort: 'Invalid value specified for sort'
        }
      });
    }

    try {
      // Get total count of documents
      let totalCount = await db.collection(DB_COLLECTION.recipes).countDocuments(criteria);

      // Calculate the total number of pages required (if each page has max of 10 documents)
      let totalPages = Math.ceil(totalCount / 10);

      // Get all coffee recipes records
      // Note: Exclude user's email in projection since it is used for verification purposes
      let recipes = await db.collection(DB_COLLECTION.recipes).find(criteria, {
        'projection': {
          'user.email': 0
        }
      }).sort(sortOption).limit(limit).skip((page - 1) * limit).toArray();

      // Populate each coffee recipe with referenced documents for beans, grinders, brewers and brewing methods
      for (let recipe of recipes) {
        await populateRecipeFields(recipe);
      }

      res.status(200); // OK
      res.json({
        status: 'success',
        data: {
          result: recipes,
          count: totalCount,
          pages: totalPages
        }
      });
    }
    catch (err) {
      sendDatabaseError(res);
    }
  });

  // Endpoint to retrieve a single coffee recipe by id
  app.get('/recipes/:recipe_id', async function (req, res) {
    try {
      // Get coffee recipe record
      const recipeRecord = await getRecordById('recipes', req.params.recipe_id);

      if (recipeRecord) {
        // Populate coffee recipe with fields from referenced documents
        await populateRecipeFields(recipeRecord);

        res.status(200); // OK
        res.json({
          status: 'success',
          data: {
            result: recipeRecord
          }
        });
      }
      else {
        res.status(400); // Bad request
        res.json({
          status: 'fail',
          data: {
            id: 'Invalid coffee recipe ID'
          }
        });
      }
    }
    catch (err) {
      sendDatabaseError(res);
    }
  });

  // Endpoint to retrieve all favorited coffee recipes of a user
  // Note: User's email is hashed for added security
  app.get('/favorites/:hash', async function (req, res) {
    // Get query strings
    let page = parseInt(req.query.page) || 1; // default page number is 1 if not specified

    try {
      // Get user's favorited coffee recipes
      let favoriteRecords = await db.collection(DB_COLLECTION.favorites).findOne({
        'user_email': req.params.hash
      }, {
        'projection': {
          'coffee_recipes': 1
        }
      });

      // If favorite records are found, extract all details of coffee recipes
      if (favoriteRecords) {
        // Populate referenced coffee recipes into favorite records
        let recipes = [];
        for (let recipeId of favoriteRecords.coffee_recipes) {
          // Get each coffee recipe
          let recipe = await getRecordById('recipes', recipeId);

          // Populate coffee recipe with fields of referenced documents
          await populateRecipeFields(recipe);

          // Push populated coffee recipe to array
          recipes.push(recipe);
        }

        // Get index range of recipes to display (fixed limit of 10 documents per page)
        let startIndex = (page - 1) * 10;
        let endIndex = page * 10;

        // Get total number of pages
        let totalPages = Math.ceil(recipes.length / 10);

        res.status(200); // OK
        res.json({
          status: 'success',
          data: {
            result: recipes.slice(startIndex, endIndex),
            count: recipes.length,
            pages: totalPages
          }
        });
      }
      else {
        // Assume that hashed email is correct and that there is no favorited coffee recipes yet
        res.status(200); // OK
        res.json({
          status: 'success',
          data: {
            result: null,
            pages: 1
          }
        });
      }
    }
    catch (err) {
      sendDatabaseError(res);
    }

  });

  // Endpoint to retrieve all coffee bean records
  app.get('/beans', async function (req, res) {
    try {
      const beanRecords = await db.collection(DB_COLLECTION.beans).find({}).toArray();

      res.status(200); // OK
      res.json({
        status: 'success',
        data: {
          result: beanRecords,
        }
      });
    }
    catch (err) {
      sendDatabaseError(res);
    }

  });

  // Endpoint to retrive coffee bean record by id
  app.get('/beans/:bean_id', async function (req, res) {
    try {
      const beanRecord = await getRecordById('beans', req.params.bean_id);

      if (beanRecord) {
        res.status(200); // OK
        res.json({
          status: 'success',
          data: {
            result: beanRecord
          }
        });
      }
      else {
        res.status(400); // Bad request
        res.json({
          status: 'fail',
          data: {
            id: "Invalid coffee bean ID"
          }
        });
      }
    }
    catch (err) {
      sendDatabaseError(res);
    }
  });


  // Endpoint to retrieve all coffee grinder records
  app.get('/grinders', async function (req, res) {
    try {
      const grinderRecords = await db.collection(DB_COLLECTION.grinders).find({}).toArray();

      res.status(200); // OK
      res.json({
        status: 'success',
        data: {
          result: grinderRecords
        }
      });
    }
    catch (err) {
      sendDatabaseError(res);
    }

  });

  // Endpoint to retrive coffee grinder record by id
  app.get('/grinders/:grinder_id', async function (req, res) {
    try {
      const grinderRecord = await getRecordById('grinders', req.params.grinder_id);

      if (grinderRecord) {
        res.status(200); // OK
        res.json({
          status: 'success',
          data: {
            result: grinderRecord
          }
        });
      }
      else {
        res.status(400); // Bad request
        res.json({
          status: 'fail',
          data: {
            id: 'Invalid coffee grinder ID'
          }
        });
      }
    }
    catch (err) {
      sendDatabaseError(res);
    }
  });


  // Endpoint to retrieve all coffee brewer records
  app.get('/brewers', async function (req, res) {
    try {
      const brewerRecords = await db.collection(DB_COLLECTION.brewers).find({}).toArray();

      res.status(200); // OK
      res.json({
        status: 'success',
        data: {
          result: brewerRecords
        }
      });
    }
    catch (err) {
      sendDatabaseError(res);
    }

  });

  // Endpoint to retrive coffee brewer record by id
  app.get('/brewers/:brewer_id', async function (req, res) {
    try {
      const brewerRecord = await getRecordById('brewers', req.params.brewer_id);

      if (brewerRecord) {
        res.status(200); // OK
        res.json({
          status: 'success',
          data: {
            result: brewerRecord
          }
        });
      }
      else {
        res.status(400); // Bad request
        res.json({
          status: 'fail',
          data: {
            id: 'Invalid coffee brewer ID'
          }
        });
      }
    }
    catch (err) {
      sendDatabaseError(res);
    }
  });


  // Endpoint to retrieve all brewing methods
  app.get('/methods', async function (req, res) {
    try {
      const methodRecords = await db.collection(DB_COLLECTION.methods).find({}).toArray();

      res.status(200); // OK
      res.json({
        status: 'success',
        data: {
          result: methodRecords
        }
      });
    }
    catch (err) {
      sendDatabaseError(res);
    }

  });

  // Endpoint to retrive brewing method by id
  app.get('/methods/:method_id', async function (req, res) {
    try {
      const methodRecord = await getRecordById('methods', req.params.method_id);

      if (methodRecord) {
        res.status(200); // OK
        res.json({
          status: 'success',
          data: {
            result: methodRecord
          }
        });
      }
      else {
        res.status(400); // Bad request
        res.json({
          status: 'fail',
          data: {
            id: 'Invalid brewing method ID'
          }
        });
      }
    }
    catch (err) {
      sendDatabaseError(res);
    }
  });

}

main();

// --- Launch server ---
app.listen(PORT, function () {
  console.log('Server has started.');
});