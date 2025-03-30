const express = require('express');
const multer = require('multer');
const ADMZip = require('adm-zip');
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
        const question = req.body.question.toLowerCase();
        let answer = '';

        if (!req.file) {
            return res.status(400).json({ answer: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const extractPath = path.join(__dirname, 'extracted');

        // Unzip the file
        const zip = new ADMZip(filePath);
        if (!fs.existsSync(extractPath)) {
            fs.mkdirSync(extractPath);
        }
        zip.extractAllTo(extractPath, true);

        // Function to read answer from files
        const getAnswerFromFile = (filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            const content = fs.readFileSync(filePath, 'utf8');

            if (ext === '.py') {
                const match = content.match(/answer\s*=\s*['"]?([^'"\n]+)['"]?/i);
                return match ? match[1] : 'No answer found in .py';
            } else if (ext === '.json') {
                const json = JSON.parse(content);
                return json.answer || 'No answer found in .json';
            } else if (ext === '.txt') {
                const match = content.match(/answer\s*[:=]\s*['"]?([^'"\n]+)['"]?/i);
                return match ? match[1] : 'No answer found in .txt';
            }
            return 'Unsupported file type';
        };

        // Search through RollNo_X folders
        const rollFolders = fs.readdirSync(extractPath).filter(f => 
            f.startsWith('RollNo_') && fs.statSync(path.join(extractPath, f)).isDirectory()
        );

        for (const rollFolder of rollFolders) {
            const subFolders = fs.readdirSync(path.join(extractPath, rollFolder)).filter(f => 
                f.startsWith('tds-2025-01-ga') && fs.statSync(path.join(extractPath, rollFolder, f)).isDirectory()
            );

            for (const subFolder of subFolders) {
                // Map ga1 to Assignment 1, ga2 to Assignment 2, etc.
                const assignmentNum = subFolder.match(/ga(\d)/)?.[1];
                if (question.includes(`assignment ${assignmentNum}`) || question.includes(`ga${assignmentNum}`)) {
                    const files = fs.readdirSync(path.join(extractPath, rollFolder, subFolder));
                    for (const file of files) {
                        if (file.startsWith('answer') && !file.endsWith('.txt')) {
                            const fileName = file.replace(/\.[^/.]+$/, '');
                            if (question.includes(fileName.toLowerCase()) || question.includes(fileName.replace('answer', '').toLowerCase())) {
                                const fullPath = path.join(extractPath, rollFolder, subFolder, file);
                                answer = getAnswerFromFile(fullPath);
                                break;
                            }
                        }
                    }
                    if (answer) break;
                }
            }
            if (answer) break;
        }

        // Cleanup
        fs.rmSync(extractPath, { recursive: true, force: true });
        fs.unlinkSync(filePath);

        res.json({ answer: answer || 'Answer not found' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ answer: 'Error processing question' });
    }
});

module.exports = app;
