const arrow = require('apache-arrow');

console.log('Available arrow functions:');
const functions = Object.keys(arrow).filter(k => typeof arrow[k] === 'function');
console.log(functions.slice(0, 30));

console.log('\nArrow functions containing vector:');
const vectorFunctions = functions.filter(k => k.toLowerCase().includes('vector'));
console.log(vectorFunctions);

console.log('\nArrow functions containing array:');
const arrayFunctions = functions.filter(k => k.toLowerCase().includes('array'));
console.log(arrayFunctions);

console.log('\nArrow functions containing list:');
const listFunctions = functions.filter(k => k.toLowerCase().includes('list'));
console.log(listFunctions);

console.log('\nArrow functions containing table:');
const tableFunctions = functions.filter(k => k.toLowerCase().includes('table'));
console.log(tableFunctions);

console.log('\nArrow functions containing builder:');
const builderFunctions = functions.filter(k => k.toLowerCase().includes('builder'));
console.log(builderFunctions);
