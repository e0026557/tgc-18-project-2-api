// --- Setup dependencies ---
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const MongoUtil = require('./utilities/MongoUtil');
const ObjectId = require('mongodb').ObjectId;
const BcryptUtil = require('./utilities/BcryptUtil');
const { ObjectID } = require('bson');

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
	'https://images.unsplash.com/photo-1585146205802-0a24b48fa5ce?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxzZWFyY2h8NXx8YWVyb3ByZXNzfGVufDB8fDB8fA%3D%3D&auto=format&fit=crop&w=500&q=60',
	'https://images.unsplash.com/photo-1588108570629-bbebb93148f0?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MTF8fGFlcm9wcmVzc3xlbnwwfHwwfHw%3D&auto=format&fit=crop&w=500&q=60',
	'https://images.unsplash.com/photo-1509042239860-f550ce710b93?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxzZWFyY2h8Mnx8Y29mZmVlfGVufDB8fDB8fA%3D%3D&auto=format&fit=crop&w=500&q=60',
	'https://images.unsplash.com/photo-1485808191679-5f86510681a2?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxzZWFyY2h8MTR8fGNvZmZlZXxlbnwwfHwwfHw%3D&auto=format&fit=crop&w=500&q=60'
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
		let recipeRecord = await db
			.collection(DB_COLLECTION.recipes)
			.findOne(
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

	// Function to validate and format coffee recipe fields for posting to database
	async function validateFormatRecipeFields(fieldObject, errorData) {
		// Get all fields for new coffee recipe
		// Note: total of 19 fields but 3 of them are optional
		let {
			imageUrl,
			recipeName,
			description,
			username,
			email,
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

		// Check that total brew time is provided (format: '<num> <unit>')
		if (totalBrewTime.split(' ').length === 2) {
			// Check that the time component is numeric
			if (isNaN(totalBrewTime.split(' ')[0])) {
				errorData['totalBrewTime'] =
					'Invalid value specified for Total Brew Time';
			}
		} else {
			errorData['totalBrewTime'] = 'Total Brew Time is a required field';
		}

		// Check that brew yield is provided (format: '<num> <unit>')
		if (brewYield.split(' ').length === 2) {
			// Check that the amount component is numeric
			if (isNaN(brewYield.split(' ')[0])) {
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

		// Check that coffee beans are provided (checkbox)
		if (coffeeBeans) {
			// Format as array if not already an array
			if (!Array.isArray(coffeeBeans)) {
				coffeeBeans = [coffeeBeans];
			}

			// Convert to an array of ObjectIds
			coffeeBeans = coffeeBeans.map((id) => ObjectId(id));
		} else {
			errorData['coffeeBeans'] = 'Coffee Beans is a required field';
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
			if (isNaN(waterAmount.split(' ')[0])) {
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

		// Check if any additional ingredients are provided (format: array) (optional field)
		if (additionalIngredients) {
			// Format as array if not already an array
			if (!Array.isArray(additionalIngredients)) {
				additionalIngredients = [additionalIngredients];
			}
		} else {
			additionalIngredients = []; // default to an empty array if not specified
		}

		// Check that brewer is provided
		if (!brewer) {
			errorData['brewer'] = 'Brewer is a required field';
		}

		// Check if any additional equipment is provided (format: array) (optional field)
		if (additionalEquipment) {
			// Format as array if not already an array
			if (!Array.isArray(additionalEquipment)) {
				additionalEquipment = [additionalEquipment];
			}
		} else {
			additionalEquipment = []; // default to an empty array if not specified
		}

		// Check that steps are provided (format: object)
		if (Object.keys(steps).length < 1) {
			errorData['steps'] = 'Steps is a required field';
		}

		// Return all formatted fields
		return {
			imageUrl,
			recipeName,
			description,
			username,
			email,
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
			// Get coffee recipe record
			const recipeRecord = await getRecordById(
				'recipes',
				req.params.recipe_id
			);

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
			// Get all fields that can be filled in for new coffee recipe
			// Note: total of 19 fields but 3 of them are optional
			let errorData = {};
			let {
				imageUrl,
				recipeName,
				description,
				username,
				email,
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
			} = await validateFormatRecipeFields(req.body, errorData);

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
				brewingMethod: ObjectId(brewingMethod),
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
			// Get hashed email of the recipe's owner
			let recipeRecord = await getRecordById(
				'recipes',
				req.params.recipe_id
			);
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
			// Get all fields that can be filled in for coffee recipe
			// Note: total of 19 fields but 3 of them are optional
			let errorData = {};
			let {
				imageUrl,
				recipeName,
				description,
				username,
				email,
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
			} = await validateFormatRecipeFields(req.body, errorData);

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
				user: {
					username: username,
					email: email
				},
				date: new Date(), // Set new date time
				total_brew_time: totalBrewTime,
				brew_yield: brewYield,
				brewingMethod: ObjectId(brewingMethod),
				coffee_beans: coffeeBeans,
				coffee_rest_period: coffeeRestPeriod,
				amount_of_coffee: Number(coffeeAmount),
				grinder: ObjectId(grinder),
				grind_setting: grindSetting,
				amount_of_water: waterAmount,
				water_temperature: Number(waterTemperature),
				additional_ingredients: additionalIngredients,
				brewer: ObjectId(brewer),
				additional_equipment: additionalEquipment
			};

			let result = await db.collection(DB_COLLECTION.recipes).updateOne(
				{
					_id: ObjectId(req.params.recipe_id)
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
			let result = await db.collection(DB_COLLECTION.recipes).deleteOne({
				_id: ObjectId(req.params.recipe_id)
			});

			sendSuccessResponse(res, 200, result);
		} catch (err) {
			sendDatabaseError(res);
		}
	});

	// --- Routes: Reviews (Part of recipes) ---
	// POST Endpoint to create a new review for a recipe
	app.post('/recipes/:recipe_id/reviews', async function (req, res) {
		try {
			// Get all fields required for recipe review and error log
			// - Validate and format fields
			let { title, content, rating, errorData } = validateFormatReviewFields(req.body);

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
				date: new Date(),
				title: title,
				content: content,
				rating: rating,
				username: username,
				email: email
			};

			// Get new average rating
			let newAverageRating = await computeAverageRating(req.params.recipe_id, rating);

			// Update recipe with new average rating and review element
			let result = await db.collection(DB_COLLECTION.recipes).updateOne(
				{
					_id: ObjectId(req.params.recipe_id)
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

	// POST Endpoint to check if user is authorised to edit/delete review
	app.post('/recipes/:recipe_id/reviews/:index/access', async function (req, res) {
		try {
			// Get recipe review
			let index = parseInt(req.params.index);
			let recipeRecord = await db.collection(DB_COLLECTION.recipes).findOne({
				'_id': ObjectId(req.params.recipe_id)
			}, {
				'projection': {
					'reviews': 1
				}
			});

			let reviewRecord = recipeRecord.reviews[index];

			// Get email of user
			let email = req.body.email;

			// Return invalid error message if no or invalid email provided
			if (!email || !validateEmail(email)) {
				sendInvalidError(res, { email: 'Invalid email address' });
			} else {
				// Verify if email matches hashed email to determine owner of recipe
				let verified = await BcryptUtil.compareHash(email, reviewRecord.email);

				// Send verification as response
				sendSuccessResponse(res, 200, { result: verified });
			}
		}
		catch (err) {
			sendDatabaseError(res);
		}
	});

	// PUT Endpoint to update review for a recipe
	app.put('/recipes/:recipe_id/reviews/:index', async function (req, res) {
		// TODO
	});

	// --- Routes: Favorites ---
	// POST Endpoint to get hashed email for accessing favorite collections
	app.post('favorites/access', async function (req, res) {
		// Get user's email
		let email = req.body.email;

		// If no or invalid email, return invalid error message
		if (!email || !validateEmail(email)) {
			sendInvalidError(res, { email: 'Invalid email address' });
		} else {
			// Return hashed email for accessing favorites collection
			let hash = await BcryptUtil.hash(email);
			sendSuccessResponse(res, 201, { hash: hash });
		}
	});

	// GET Endpoint to retrieve all favorited coffee recipes of a user
	// Note: User's email is hashed for added security
	app.get('/favorites/:hash', async function (req, res) {
		// Get query strings
		let page = parseInt(req.query.page) || 1; // default page number is 1 if not specified

		try {
			// Get user's favorited coffee recipes
			let favoriteRecords = await db
				.collection(DB_COLLECTION.favorites)
				.findOne(
					{
						user_email: req.params.hash
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
				// Assume that hashed email is correct and that there is no favorited coffee recipes yet
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
			const beanRecord = await getRecordById('beans', req.params.bean_id);

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
			const grinderRecord = await getRecordById(
				'grinders',
				req.params.grinder_id
			);

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
			const brewerRecord = await getRecordById(
				'brewers',
				req.params.brewer_id
			);

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
			const methodRecord = await getRecordById(
				'methods',
				req.params.method_id
			);

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
