const express = require('express');
const multer = require('multer');
const ADMZip = require('adm-zip');
const { parse } = require('csv-parse/sync');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

app.post('/', upload.single('file'), (req, res) => {
    try {
        const question = req.body.question;
        let answer = '';

        // Handle questions with file attachments
        if (req.file) {
            const filePath = req.file.path;
            
            // Check if it's a zip file question
            if (question.includes('.zip') && question.includes('extract.csv')) {
                // Unzip the file
                const zip = new ADMZip(filePath);
                const extractPath = path.join(__dirname, 'extracted');
                
                // Create extract directory if it doesn't exist
                if (!fs.existsSync(extractPath)) {
                    fs.mkdirSync(extractPath);
                }
                
                zip.extractAllTo(extractPath, true);
                
                // Read CSV file
                const csvPath = path.join(extractPath, 'extract.csv');
                const csvContent = fs.readFileSync(csvPath);
                const records = parse(csvContent, { columns: true });
                
                // Get value from 'answer' column (assuming first row)
                answer = records[0]['answer'];
                
                // Cleanup
                fs.rmSync(extractPath, { recursive: true, force: true });
            }
            
            // Cleanup uploaded file
            fs.unlinkSync(filePath);
        }

        // Add more question type handlers here as needed
        // For example:
        // if (question.includes('some other pattern')) {
        //     answer = 'calculated answer';
        // }

        res.json({ answer: answer || 'default answer' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ answer: 'Error processing question' });
    }
});

module.exports = app;
