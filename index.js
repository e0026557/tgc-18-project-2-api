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
app.use(
	express.urlencoded({
		extended: false
	})
);

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
};

const IMAGE_URLS = [
	'https://images.unsplash.com/photo-1585146205802-0a24b48fa5ce?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1936&q=80',
	'https://images.unsplash.com/photo-1522726481795-a4ae463bcf81?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=687&q=80',
	'https://images.unsplash.com/photo-1531582750043-221f07a6a0fc?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=687&q=80',
	'https://images.unsplash.com/photo-1509042239860-f550ce710b93?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=687&q=80',
	'https://images.unsplash.com/photo-1485808191679-5f86510681a2?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=687&q=80',
	'https://images.unsplash.com/photo-1572119243889-4939ec2ced2c?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1170&q=80',
	'https://images.unsplash.com/photo-1522725843938-035891590561?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=687&q=80',
	'https://images.unsplash.com/photo-1588108570629-bbebb93148f0?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=764&q=80',
	'https://images.unsplash.com/photo-1570968915860-54d5c301fa9f?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=735&q=80',
	'https://images.unsplash.com/photo-1561882468-9110e03e0f78?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=687&q=80'
];

// --- Main ---
async function main() {
	// Connect to database
	const db = await MongoUtil.connect(MONGO_URI, DB_NAME);

	// --- Functions ---
	async function getRecordById(collection, id) {
		const record = await db.collection(DB_COLLECTION[collection]).findOne({
			_id: ObjectId(id)
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
		recipe.brewing_method = await getRecordById(
			'methods',
			recipe.brewing_method
		);
	}

	function sendSuccessResponse(res, code, data) {
		res.status(code); // either OK or Created
		res.json({
			status: 'success',
			data: data
		});
	}

	function sendInvalidError(res, data) {
		res.status(400); // Bad request
		res.json({
			status: 'fail',
			data: data
		});
	}

	function sendDatabaseError(res) {
		res.status(500); // Internal server error
		res.json({
			status: 'error',
			message: 'Unable to communicate with database'
		});
	}

	function validateUrl(url) {
		let regex = new RegExp(
			/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi
		);

		if (url.match(regex)) {
			return true;
		}
		return false;
	}

	function validateEmail(email) {
		let regex = new RegExp(/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/gi);

		if (email.match(regex)) {
			return true;
		}
		return false;
	}

	async function computeAverageRating(recipeId, newRating) {
		// Returns the recalculated the new average_rating field of the recipe given new rating
		let recipeRecord = await db.collection(DB_COLLECTION.recipes).findOne(
			{
				_id: ObjectId(recipeId)
			},
			{
				projection: {
					'reviews.rating': 1
				}
			}
		);

		let totalRating = 0;
		for (let review of recipeRecord.reviews) {
			totalRating += parseInt(review.rating);
		}

		totalRating += newRating; // Include rating from new review

		let newAverageRating = (
			totalRating /
			(recipeRecord.reviews.length + 1)
		).toFixed(1); // Round to nearest 1 decimal place
		newAverageRating = parseFloat(newAverageRating); // Convert back to float

		return newAverageRating;
	}

	// Function to validate and format coffee recipe fields (excluding username and email)
	async function validateFormatRecipeFields(fieldObject) {
		// Initialise an error log
		let errorData = {};

		// Get all fields for new coffee recipe (excluding username and email)
		// Note: Total of 17 fields but 3 of them are optional
		let {
			imageUrl,
			recipeName,
			description,
			totalBrewTime,
			brewYield,
			brewingMethod,
			coffeeBeans,
			coffeeRestPeriod,
			coffeeAmount,
			grinder,
			grindSetting,
			waterAmount,
			waterTemperature,
			additionalIngredients,
			brewer,
			additionalEquipment,
			steps
		} = fieldObject;

		// If imageUrl is provided, check that it is a valid URL
		// else set imageUrl to a default image url
		if (imageUrl) {
			if (!validateUrl(imageUrl)) {
				errorData['imageUrl'] = 'Invalid image URL';
			}
		} else {
			imageUrl = getRandomImageUrl();
		}

		// Check that recipe name is provided (at least 5 characters)
		if (recipeName) {
			if (recipeName.length < 5) {
				errorData['recipeName'] =
					'Recipe name must be at least 5 characters';
			}
		} else {
			errorData['recipeName'] = 'Recipe name is a required field';
		}

		// Check that description is provided (at least 5 characters)
		if (description) {
			if (description.length < 5) {
				errorData['description'] =
					'Description must be at least 5 characters';
			}
		} else {
			errorData['description'] = 'Description is a required field';
		}

		// Check that total brew time is provided (format: '<num> <unit>')
		if (totalBrewTime.split(' ').length === 2) {
			// Check that the time component is numeric
			if (
				!totalBrewTime.split(' ')[0] ||
				isNaN(totalBrewTime.split(' ')[0])
			) {
				errorData['totalBrewTime'] =
					'Invalid value specified for Total Brew Time';
			}
		} else {
			errorData['totalBrewTime'] = 'Total Brew Time is a required field';
		}

		// Check that brew yield is provided (format: '<num> <unit>')
		if (brewYield.split(' ').length === 2) {
			// Check that the amount component is numeric
			if (!brewYield.split(' ')[0] || isNaN(brewYield.split(' ')[0])) {
				errorData['brewYield'] =
					'Invalid value specified for Brew Yield';
			}
		} else {
			errorData['brewYield'] = 'Brew Yield is a required field';
		}

		// Check that brewing method is provided
		if (!brewingMethod) {
			errorData['brewingMethod'] = 'Brewing Method is a required field';
		}

		// Check that coffee beans are provided (array)
		if (Array.isArray(coffeeBeans)) {
			if (coffeeBeans.length > 0) {
				// Map to an array of ObjectIds
				coffeeBeans = coffeeBeans.map((id) => ObjectId(id));
			} else {
				errorData['coffeeBeans'] = 'Coffee Beans is a required field';
			}
		} else {
			errorData['coffeeBeans'] = 'Coffee Beans must be an array';
		}

		// Check that coffee rest period is provided (select)
		if (!coffeeRestPeriod) {
			errorData['coffeeRestPeriod'] =
				'Coffee Rest Period is a required field';
		}

		// Check that coffee amount is provided (in grams)
		if (coffeeAmount) {
			// Check that coffee amount is numeric
			if (isNaN(coffeeAmount)) {
				errorData['coffeeAmount'] =
					'Invalid value specified for Coffee Amount';
			}
		} else {
			errorData['coffeeAmount'] = 'Coffee Amount is a required field';
		}

		// Check that grinder is provided
		if (!grinder) {
			errorData['grinder'] = 'Grinder is a required field';
		}

		// Check that grind setting is provided (string since different grinders have different way of specifying)
		if (!grindSetting) {
			errorData['grindSetting'] = 'Grind Setting is a required field';
		}

		// Check that water amount is provided (format: '<num> <unit>')
		if (waterAmount.split(' ').length === 2) {
			// Check that amount component is numeric
			if (
				!waterAmount.split(' ')[0] ||
				isNaN(waterAmount.split(' ')[0])
			) {
				errorData['waterAmount'] =
					'Invalid value specified for Water Amount';
			}
		} else {
			errorData['waterAmount'] = 'Water Amount is a required field';
		}

		// Check that water temperature is provided
		if (waterTemperature) {
			// Check that water temperature is numeric
			if (isNaN(waterTemperature)) {
				errorData['waterTemperature'] =
					'Invalid value specified for Water Temperature';
			}
		} else {
			errorData['waterTemperature'] =
				'Water Temperature is a required field';
		}

		// Check if any additional ingredients are provided (array) (optional field)
		if (additionalIngredients) {
			// Check that additional ingredients is an array if specified
			if (!Array.isArray(additionalIngredients)) {
				errorData['additionalIngredients'] =
					'Additional Ingredients must be an array';
			}
		} else {
			additionalIngredients = []; // default to an empty array if not specified
		}

		// Check that brewer is provided
		if (!brewer) {
			errorData['brewer'] = 'Brewer is a required field';
		}

		// Check if any additional equipment is provided (array) (optional field)
		if (additionalEquipment) {
			// Check that additional equipment is an array if specified
			if (!Array.isArray(additionalEquipment)) {
				errorData['additionalEquipment'] =
					'Additional Equipment must be an array';
			}
		} else {
			additionalEquipment = []; // default to an empty array if not specified
		}

		// Check that steps are provided (array)
		if (steps) {
			// Check that steps is an array and not empty
			if (!Array.isArray(steps)) {
				errorData['steps'] = 'Steps must be an array';
			} else if (steps.length === 0) {
				errorData['steps'] = 'Steps cannot be an empty array';
			}
		} else {
			errorData['steps'] = 'Steps is a required field';
		}

		// Return all formatted fields and error log
		return {
			imageUrl,
			recipeName,
			description,
			totalBrewTime,
			brewYield,
			brewingMethod,
			coffeeBeans,
			coffeeRestPeriod,
			coffeeAmount,
			grinder,
			grindSetting,
			waterAmount,
			waterTemperature,
			additionalIngredients,
			brewer,
			additionalEquipment,
			steps,
			errorData
		};
	}

	function validateFormatReviewFields(fields) {
		let { title, content, rating } = fields;
		let errorData = {};

		// Check the fields for review content
		// - title and content must be at least 5 characters long
		if (!title || title.length < 5) {
			errorData['title'] = 'Title must be at least 5 characters';
		}

		if (!content || content.length < 5) {
			errorData['content'] = 'Content must be at least 5 characters';
		}

		// - rating must be a numeric value from 1 to 5
		// Convert rating to number
		rating = parseInt(rating);
		if (!rating || rating < 1 || rating > 5) {
			errorData['rating'] = 'Rating must be an integer from 1 to 5';
		}

		return { title, content, rating, errorData };
	}

	function getRandomImageUrl() {
		let imageCount = IMAGE_URLS.length;
		let index = Math.floor(Math.random() * imageCount);
		return IMAGE_URLS[index];
	}

	// --- Routes ---
	app.get('/', function (req, res) {
		res.send('Welcome to CoffeeTalk API');
	});

	// --- Routes: Recipes ---
	// GET Endpoint to retrieve all coffee recipes
	app.get('/recipes', async function (req, res) {
		// Get query strings
		// Note: beans is a comma-separated string of ids
		// grinder, method, and brewer are ids
		// sort is a string that is either 'date' or 'rating'
		let {
			name,
			beans,
			grinder,
			method,
			brewer,
			rating,
			page,
			limit,
			sort
		} = req.query;

		let errorData = {};

		// Initialise criteria object
		let criteria = {};

		if (name) {
			// Search for coffee recipe by name (case-insensitive)
			criteria['recipe_name'] = {
				$regex: name,
				$options: 'i'
			};
		}

		if (beans) {
			// Convert beans into array of ObjectIds
			beans = beans.split(',');
			beans = beans.map((id) => ObjectId(id));

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
			} else {
				errorData['rating'] = 'Invalid value specified for rating';
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
				date: -1
			};
		} else if (sort === 'rating') {
			sortOption = {
				average_rating: -1
			};
		} else {
			errorData['sort'] = 'Invalid value specified for sort';
		}

		// Return error message if any errors found
		if (Object.keys(errorData).length > 0) {
			sendInvalidError(res, errorData);
			return; // End the function
		}

		try {
			// Get total count of documents
			let totalCount = await db
				.collection(DB_COLLECTION.recipes)
				.countDocuments(criteria);

			// Calculate the total number of pages required (if each page has max of 10 documents)
			let totalPages = Math.ceil(totalCount / 10);

			// Get all coffee recipes records
			// Note: Exclude user's email in projection since it is used for verification purposes
			let recipes = await db
				.collection(DB_COLLECTION.recipes)
				.find(criteria, {
					projection: {
						'user.email': 0,
						reviews: 0
					}
				})
				.sort(sortOption)
				.limit(limit)
				.skip((page - 1) * limit)
				.toArray();

			// Populate each coffee recipe with referenced documents for beans, grinders, brewers and brewing methods
			for (let recipe of recipes) {
				await populateRecipeFields(recipe);
			}

			// Data to be sent as response
			let data = {
				result: recipes,
				count: totalCount,
				pages: totalPages
			};

			sendSuccessResponse(res, 200, data);
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// GET Endpoint to retrieve a single coffee recipe by id
	app.get('/recipes/:recipe_id', async function (req, res) {
		try {
			// Extract recipe ID
			let recipeId = req.params.recipe_id;

			// Check that recipe ID is valid
			if (!recipeId || !ObjectId.isValid(recipeId)) {
				sendInvalidError(res, { recipe_id: 'Invalid recipe ID' });
				return; // End function
			}

			// Get coffee recipe record
			const recipeRecord = await getRecordById('recipes', recipeId);

			if (recipeRecord) {
				// Populate coffee recipe with fields from referenced documents
				await populateRecipeFields(recipeRecord);
				sendSuccessResponse(res, 200, { result: recipeRecord });
			} else {
				sendInvalidError(res, { id: 'Invalid coffee recipe ID' });
			}
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// POST Endpoint to create a new coffee recipe
	app.post('/recipes', async function (req, res) {
		try {
			// Get all fields that can be filled in for new coffee recipe and error log
			// Note: Total of 17 fields but 3 of them are optional
			let {
				imageUrl,
				recipeName,
				description,
				totalBrewTime,
				brewYield,
				brewingMethod,
				coffeeBeans,
				coffeeRestPeriod,
				coffeeAmount,
				grinder,
				grindSetting,
				waterAmount,
				waterTemperature,
				additionalIngredients,
				brewer,
				additionalEquipment,
				steps,
				errorData
			} = await validateFormatRecipeFields(req.body);

			// Validate username and email
			let { username, email } = req.body;
			// Check that username is provided (at least 5 characters)
			if (username) {
				if (username.length < 5) {
					errorData['username'] =
						'Username must be at least 5 characters';
				}
			} else {
				errorData['username'] = 'Username is a required field';
			}

			// Check that email is provided
			if (email) {
				if (!validateEmail(email)) {
					errorData['email'] = 'Invalid email address';
				} else {
					// Hash email
					email = await BcryptUtil.hash(email);
				}
			} else {
				errorData['email'] = 'Email is a required field';
			}

			// Return error message if there is any error so far
			if (Object.keys(errorData).length > 0) {
				sendInvalidError(res, errorData);
				return; // End function
			}

			// If no errors, proceed to create a new recipe in database
			let newRecipe = {
				image_url: imageUrl,
				recipe_name: recipeName,
				description: description,
				average_rating: 0, // default is 0 since no reviews yet
				user: {
					username: username,
					email: email
				},
				date: new Date(),
				total_brew_time: totalBrewTime,
				brew_yield: brewYield,
				brewing_method: ObjectId(brewingMethod),
				coffee_beans: coffeeBeans,
				coffee_rest_period: coffeeRestPeriod,
				amount_of_coffee: Number(coffeeAmount),
				grinder: ObjectId(grinder),
				grind_setting: grindSetting,
				amount_of_water: waterAmount,
				water_temperature: Number(waterTemperature),
				additional_ingredients: additionalIngredients,
				brewer: ObjectId(brewer),
				additional_equipment: additionalEquipment,
				steps: steps,
				reviews: [] // empty array since no reviews yet
			};

			let result = await db
				.collection(DB_COLLECTION.recipes)
				.insertOne(newRecipe);

			sendSuccessResponse(res, 201, result);
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// POST Endpoint to verify if user has the credential to update/delete recipe
	app.post('/recipes/:recipe_id/access', async function (req, res) {
		try {
			// Extract recipe ID
			let recipeId = req.params.recipe_id;

			// Check that recipe ID is valid
			if (!recipeId || !ObjectId.isValid(recipeId)) {
				sendInvalidError(res, { recipe_id: 'Invalid recipe ID' });
				return; // End function
			}

			// Get hashed email of the recipe's owner
			let recipeRecord = await getRecordById('recipes', recipeId);
			let hash = recipeRecord.user.email;

			// Get user's email
			let email = req.body.email;

			// Return invalid error message if no or invalid email provided
			if (!email || !validateEmail(email)) {
				sendInvalidError(res, { email: 'Invalid email address' });
			} else {
				// Verify if email matches hashed email to determine owner of recipe
				let verified = await BcryptUtil.compareHash(email, hash);

				// Send verification as response
				sendSuccessResponse(res, 200, { result: verified });
			}
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// PUT Endpoint to update a coffee recipe
	app.put('/recipes/:recipe_id', async function (req, res) {
		try {
			// Extract recipe ID
			let recipeId = req.params.recipe_id;

			// Check that recipe ID is valid
			if (!recipeId || !ObjectId.isValid(recipeId)) {
				sendInvalidError(res, { recipe_id: 'Invalid recipe ID' });
				return; // End function
			}

			// Get all fields that can be filled in for coffee recipe and error log
			// Note: Total of 17 fields but 3 of them are optional
			// Note: username and email are fixed and not editable
			let {
				imageUrl,
				recipeName,
				description,
				totalBrewTime,
				brewYield,
				brewingMethod,
				coffeeBeans,
				coffeeRestPeriod,
				coffeeAmount,
				grinder,
				grindSetting,
				waterAmount,
				waterTemperature,
				additionalIngredients,
				brewer,
				additionalEquipment,
				steps,
				errorData
			} = await validateFormatRecipeFields(req.body);

			console.log(errorData);

			// Return error message if there is any error so far
			if (Object.keys(errorData).length > 0) {
				sendInvalidError(res, errorData);
				return; // End function
			}

			// If no errors, proceed to update recipe in database
			let updatedRecipe = {
				image_url: imageUrl,
				recipe_name: recipeName,
				description: description,
				date: new Date(), // Set new date time
				total_brew_time: totalBrewTime,
				brew_yield: brewYield,
				brewing_method: ObjectId(brewingMethod),
				coffee_beans: coffeeBeans,
				coffee_rest_period: coffeeRestPeriod,
				amount_of_coffee: Number(coffeeAmount),
				grinder: ObjectId(grinder),
				grind_setting: grindSetting,
				amount_of_water: waterAmount,
				water_temperature: Number(waterTemperature),
				additional_ingredients: additionalIngredients,
				brewer: ObjectId(brewer),
				additional_equipment: additionalEquipment,
				steps: steps
			};

			let result = await db.collection(DB_COLLECTION.recipes).updateOne(
				{
					_id: ObjectId(recipeId)
				},
				{
					$set: updatedRecipe
				}
			);

			sendSuccessResponse(res, 200, result);
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// DELETE Endpoint to delete a coffee recipe
	app.delete('/recipes/:recipe_id', async function (req, res) {
		try {
			// Extract recipe ID
			let recipeId = req.params.recipe_id;

			// Check that recipe ID is valid
			if (!recipeId || !ObjectId.isValid(recipeId)) {
				sendInvalidError(res, { recipe_id: 'Invalid recipe ID' });
				return; // End function
			}

			// Delete recipe from recipes collection
			let result = await db.collection(DB_COLLECTION.recipes).deleteOne({
				_id: ObjectId(recipeId)
			});

			// Delete recipe from all favorites collection
			await db.collection(DB_COLLECTION.favorites).updateMany(
				{
					coffee_recipes: {
						$in: [ObjectId(recipeId)]
					}
				},
				{
					$pull: {
						coffee_recipes: ObjectId(recipeId)
					}
				}
			);

			sendSuccessResponse(res, 200, result);
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// --- Routes: Reviews (Part of recipes) ---
	// POST Endpoint to create a new review for a recipe
	app.post('/recipes/:recipe_id/reviews', async function (req, res) {
		try {
			// Extract recipe ID
			let recipeId = req.params.recipe_id;

			// Check that recipe ID is valid
			if (!recipeId || !ObjectId.isValid(recipeId)) {
				sendInvalidError(res, { recipe_id: 'Invalid recipe ID' });
				return; // End function
			}

			// Get all fields required for recipe review and error log
			// - Validate and format fields
			let { title, content, rating, errorData } =
				validateFormatReviewFields(req.body);

			// Check that username and email are valid
			// Note: username and email are used for identification purposes (cannot be changed)
			let { username, email } = req.body;

			// - Username must be at least 5 characters long
			if (!username || username.length < 5) {
				errorData['username'] =
					'Username must be at least 5 characters';
			}

			// - Validate email address
			if (validateEmail(email)) {
				// Convert email to hash if valid email provided
				email = await BcryptUtil.hash(email);
			} else {
				errorData['email'] = 'Invalid email address';
			}

			// If there are any errors, return error message
			if (Object.keys(errorData).length > 0) {
				sendInvalidError(res, errorData);
				return; // End function
			}

			// Create a new review object
			let newReview = {
				_id: new ObjectId(),
				date: new Date(),
				title: title,
				content: content,
				rating: rating,
				username: username,
				email: email
			};

			// Get new average rating
			let newAverageRating = await computeAverageRating(recipeId, rating);

			// Update recipe with new average rating and review element
			let result = await db.collection(DB_COLLECTION.recipes).updateOne(
				{
					_id: ObjectId(recipeId)
				},
				{
					$push: {
						reviews: newReview
					},
					$set: {
						average_rating: newAverageRating
					}
				}
			);

			sendSuccessResponse(res, 201, result);
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// --- Routes: Favorites ---
	// GET Endpoint to retrieve all favorited coffee recipes of a user
	// Note: Unable to use hashed email as search query since hash is always changing despite same key
	// (currently using email for favorites collection)
	app.get('/favorites/:email', async function (req, res) {
		// Get query strings
		let page = parseInt(req.query.page) || 1; // default page number is 1 if not specified

		// Validate if email is valid
		let email = req.params.email;
		if (!email || !validateEmail(email)) {
			sendInvalidError(res, { email: 'Invalid email address' });
			return; // End function
		}

		try {
			// Get user's favorited coffee recipes
			let favoriteRecords = await db
				.collection(DB_COLLECTION.favorites)
				.findOne(
					{
						user_email: email
					},
					{
						projection: {
							coffee_recipes: 1
						}
					}
				);

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

				// Data to be sent as response
				let data = {
					result: recipes.slice(startIndex, endIndex),
					count: recipes.length,
					pages: totalPages
				};

				sendSuccessResponse(res, 200, data);
			} else {
				// Assume there is no favorited coffee recipes yet (favorites collection not created yet)
				let data = {
					result: null,
					pages: 1
				};

				sendSuccessResponse(res, 200, data);
			}
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// POST Endpoint to add recipe to favorites
	app.post('/favorites/:email', async function (req, res) {
		// Get recipe ID to be added to favorites collection
		let recipeId = req.body.recipeId;

		// Check that recipe ID is valid
		if (!recipeId || !ObjectId.isValid(recipeId)) {
			sendInvalidError(res, { recipeId: 'Invalid recipe ID' });
			return; // End function
		}

		// Validate email
		let email = req.params.email;
		if (!email || !validateEmail(email)) {
			sendInvalidError(res, { email: 'Invalid email address' });
			return; // End function
		}

		try {
			// Check if favorites collection exists for the user
			let favoriteRecord = await db
				.collection(DB_COLLECTION.favorites)
				.findOne({
					user_email: email
				});

			// If favorites collection exists, add coffee recipe ID to coffee_recipes array
			if (favoriteRecord) {
				// Check if recipe exists in the recipes collection
				let recipeRecord = await getRecordById('recipes', recipeId);
				if (!recipeRecord) {
					sendInvalidError(res, {recipeId: 'Recipe does not exist'});
					return; // End function
				}

				// Check if recipe ID to be added already exists in user's favorites collection
				let favoritedRecipeRecord = await db
					.collection(DB_COLLECTION.favorites)
					.findOne({
						_id: favoriteRecord._id,
						coffee_recipes: {
							$in: [ObjectId(recipeId)]
						}
					});

				if (favoritedRecipeRecord) {
					sendInvalidError(res, {
						recipeId: 'Recipe ID is already in favorites collection'
					});
					return; // End function
				}

				let result = await db
					.collection(DB_COLLECTION.favorites)
					.updateOne(
						{
							_id: ObjectId(favoriteRecord._id)
						},
						{
							$push: {
								coffee_recipes: ObjectId(recipeId)
							}
						}
					);

				sendSuccessResponse(res, 200, result);
			} else {
				// If favorites collection does not exist, create a new favorites collection
				let newFavoriteRecord = {
					user_email: email,
					coffee_recipes: [ObjectId(recipeId)]
				};

				let result = await db
					.collection(DB_COLLECTION.favorites)
					.insertOne(newFavoriteRecord);

				sendSuccessResponse(res, 201, result);
			}
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// DELETE Endpoint to remove recipe from favorites
	app.delete('/favorites/:email', async function (req, res) {
		// Get recipe ID to be added to favorites collection
		let recipeId = req.body.recipeId;

		// Check that recipe ID is valid
		if (!recipeId || !ObjectId.isValid(recipeId)) {
			sendInvalidError(res, { recipeId: 'Invalid recipe ID' });
			return; // End function
		}

		// Validate email
		let email = req.params.email;
		if (!email || !validateEmail(email)) {
			sendInvalidError(res, { email: 'Invalid email address' });
			return; // End function
		}

		try {
			// Check if recipe ID to be deleted exists
			let document = await db
				.collection(DB_COLLECTION.favorites)
				.findOne({
					user_email: email,
					coffee_recipes: {
						$in: [ObjectId(recipeId)]
					}
				});

			if (!document) {
				sendInvalidError(res, {
					recipeId: 'Recipe ID does not exist in favorites collection'
				});
				return; // End function
			}

			let result = await db.collection(DB_COLLECTION.favorites).updateOne(
				{
					user_email: email,
					coffee_recipes: {
						$in: [ObjectId(recipeId)]
					}
				},
				{
					$pull: {
						coffee_recipes: ObjectId(recipeId)
					}
				}
			);

			sendSuccessResponse(res, 200, result);
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// --- Routes: Beans ---
	// GET Endpoint to retrieve all coffee bean records
	app.get('/beans', async function (req, res) {
		try {
			const beanRecords = await db
				.collection(DB_COLLECTION.beans)
				.find({})
				.toArray();
			sendSuccessResponse(res, 200, { result: beanRecords });
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// GET Endpoint to retrive coffee bean record by id
	app.get('/beans/:bean_id', async function (req, res) {
		try {
			// Extract bean ID
			let beanId = req.params.bean_id;

			// Check that bean ID is valid
			if (!beanId || !ObjectId.isValid(beanId)) {
				sendInvalidError(res, { bean_id: 'Invalid coffee bean ID' });
				return; // End function
			}

			const beanRecord = await getRecordById('beans', beanId);

			if (beanRecord) {
				sendSuccessResponse(res, 200, { result: beanRecord });
			} else {
				sendInvalidError(res, { id: 'Invalid coffee bean ID' });
			}
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// --- Routes: Grinders ---
	// GET Endpoint to retrieve all coffee grinder records
	app.get('/grinders', async function (req, res) {
		try {
			const grinderRecords = await db
				.collection(DB_COLLECTION.grinders)
				.find({})
				.toArray();
			sendSuccessResponse(res, 200, { result: grinderRecords });
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// GET Endpoint to retrive coffee grinder record by id
	app.get('/grinders/:grinder_id', async function (req, res) {
		try {
			// Extract grinder ID
			let grinderId = req.params.grinder_id;

			// Check that grinder ID is valid
			if (!grinderId || !ObjectId.isValid(grinderId)) {
				sendInvalidError(res, {
					grinder_id: 'Invalid coffee grinder ID'
				});
				return; // End function
			}

			const grinderRecord = await getRecordById('grinders', grinderId);

			if (grinderRecord) {
				sendSuccessResponse(res, 200, { result: grinderRecord });
			} else {
				sendInvalidError(res, { id: 'Invalid coffee grinder ID' });
			}
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// --- Routes: Brewers ---
	// GET Endpoint to retrieve all coffee brewer records
	app.get('/brewers', async function (req, res) {
		try {
			const brewerRecords = await db
				.collection(DB_COLLECTION.brewers)
				.find({})
				.toArray();
			sendSuccessResponse(res, 200, { result: brewerRecords });
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// GET Endpoint to retrive coffee brewer record by id
	app.get('/brewers/:brewer_id', async function (req, res) {
		try {
			// Extract brewer ID
			let brewerId = req.params.brewer_id;

			// Check that brewer ID is valid
			if (!brewerId || !ObjectId.isValid(brewerId)) {
				sendInvalidError(res, {
					brewer_id: 'Invalid coffee brewer ID'
				});
				return; // End function
			}

			const brewerRecord = await getRecordById('brewers', brewerId);

			if (brewerRecord) {
				sendSuccessResponse(res, 200, { result: brewerRecord });
			} else {
				sendInvalidError(res, { id: 'Invalid coffee brewer ID' });
			}
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// --- Routes: Methods ---
	// GET Endpoint to retrieve all brewing methods
	app.get('/methods', async function (req, res) {
		try {
			const methodRecords = await db
				.collection(DB_COLLECTION.methods)
				.find({})
				.toArray();
			sendSuccessResponse(res, 200, { result: methodRecords });
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// GET Endpoint to retrive brewing method by id
	app.get('/methods/:method_id', async function (req, res) {
		try {
			// Extract method ID
			let methodId = req.params.method_id;

			// Check that method ID is valid
			if (!methodId || !ObjectId.isValid(methodId)) {
				sendInvalidError(res, {
					method_id: 'Invalid coffee method ID'
				});
				return; // End function
			}

			const methodRecord = await getRecordById('methods', methodId);

			if (methodRecord) {
				sendSuccessResponse(res, 200, { result: methodRecord });
			} else {
				sendInvalidError(res, { id: 'Invalid brewing method ID' });
			}
		} catch (err) {
			sendDatabaseError(res);
		}
	});
}

main();

// --- Launch server ---
app.listen(PORT, function () {
	console.log('Server has started.');
});
