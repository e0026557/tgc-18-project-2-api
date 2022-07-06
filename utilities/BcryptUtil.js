// Require dependencies
const bcrypt = require('bcrypt');

// Function to hash
async function hash(plainText) {
  // Hash function takes in 2 arguments
  // First arg -> text to be encrypted
  // Second arg -> salt (cost factor that determines the time taken to hash and difficulty to reverse hash via brute force)
  const hash = await bcrypt.hash(plainText, 5);
  return hash;
}

// Function to verify input with hash
// -> returns true if plain text matches hashed plain text
async function compareHash(plainText, hash) {
  const result = await bcrypt.compare(plainText, hash);
  return result;
}

// Export functions for use in other JS files
module.exports = {
  hash,
  compareHash
}