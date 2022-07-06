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

  // Routes
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

    if (rating) {
      criteria['average_rating'] = {
        $gte: Number(rating)
      };
    }

    // If page is not specified, default value is 1
    page = page ? page : 1;

    // If limit is not specified, default value is 10
    // If limit is specified, convert to int (default is string)
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
        message: 'Invalid value specified for sort'
      });
    }

    try {
      // Get total count of documents
      let totalCount = await db.collection(DB_COLLECTION.recipes).find(criteria).count();

      // Calculate the total number of pages required (if each page has max of 10 documents)
      let totalPages = Math.ceil(totalCount / 10);

      // Exclude user's email in projection since it is used for verification purposes
      let recipes = await db.collection(DB_COLLECTION.recipes).find(criteria, {
        'projection': {
          'user.email': 0
        }
      }).sort(sortOption).limit(limit).skip((page - 1) * limit).toArray();

      // Populate each recipe with referenced documents for beans, grinders, brewers and brewing methods
      for (let recipe of recipes) {
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

      res.status(200); // OK
      res.json({
        result: recipes,
        pages: totalPages
      });
    }
    catch (err) {
      res.status(500); // Internal server error
      res.json({
        message: "Internal server error. Please contact administrator.",
      })
    }
  });

  // Endpoint to retrieve a single coffee recipe by id
  app.get('/recipes/:recipe_id', async function (req, res) {
    // Get coffee recipe record
    const recipeRecord = await getRecordById('recipes', req.params.recipe_id);

    if (recipeRecord) {
      res.status(200); // OK
      res.json(recipeRecord);
    }
    else {
      res.status(400); // Bad request
      res.json({
        message: 'Invalid coffee recipe ID.'
      });
    }
  });

}

main();

// --- Launch server ---
app.listen(PORT, function () {
  console.log('Server has started.');
});