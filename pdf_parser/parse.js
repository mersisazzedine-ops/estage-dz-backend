const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('C:\\Users\\PROBOOK\\Downloads\\E-Stage-DZ-Backend-Requirements.pdf');

pdf(dataBuffer).then(function (data) {
    fs.writeFileSync('output.txt', data.text);
    console.log('Successfully extracted text');
}).catch(err => {
    console.error('Error extracting text:', err);
});
