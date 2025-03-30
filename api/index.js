const express = require('express');
const multer = require('multer');
const ADMZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const app = express();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = '/tmp/uploads';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

app.post('/', upload.single('file'), (req, res) => {
    try {
        console.log('Request received:', { question: req.body.question, file: req.file });
        const question = req.body.question ? req.body.question.toLowerCase() : 'no question provided';
        let answer = '';

        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({ answer: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const extractPath = '/tmp/extracted';
        console.log('File uploaded to:', filePath);

        if (!fs.existsSync(filePath)) {
            console.log('Uploaded file not found');
            return res.status(500).json({ answer: 'Uploaded file not found on server' });
        }

        console.log('Unzipping to:', extractPath);
        const zip = new ADMZip(filePath);
        if (!fs.existsSync(extractPath)) {
            fs.mkdirSync(extractPath, { recursive: true });
        }
        zip.extractAllTo(extractPath, true);

        const extractedFiles = fs.readdirSync(extractPath);
        console.log('Extracted files:', extractedFiles);
        if (extractedFiles.length === 0) {
            return res.status(500).json({ answer: 'ZIP extraction failed - no files found' });
        }

        const getAnswerFromFile = (filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            const content = fs.readFileSync(filePath, 'utf8');
            console.log(`Reading file: ${filePath}, ext: ${ext}`);
            if (ext === '.py') {
                const match = content.match(/answer\s*=\s*['"]?([^'"\n]+)['"]?/i);
                return match ? match[1] : 'No answer found in .py';
            } else if (ext === '.json') {
                try {
                    const json = JSON.parse(content);
                    return json.answer || 'No answer found in .json';
                } catch (e) {
                    return 'Invalid JSON format';
                }
            } else if (ext === '.txt') {
                const match = content.match(/answer\s*[:=]\s*['"]?([^'"\n]+)['"]?/i);
                return match ? match[1] : 'No answer found in .txt';
            }
            return 'Unsupported file type';
        };

        const rollFolders = extractedFiles.filter(f => 
            f.startsWith('RollNo_') && fs.statSync(path.join(extractPath, f)).isDirectory()
        );
        console.log('Roll folders:', rollFolders);
        if (rollFolders.length === 0) {
            return res.status(500).json({ answer: 'No RollNo_X folders found' });
        }

        for (const rollFolder of rollFolders) {
            const subFolders = fs.readdirSync(path.join(extractPath, rollFolder)).filter(f => 
                f.startsWith('tds-2025-01-ga') && fs.statSync(path.join(extractPath, rollFolder, f)).isDirectory()
            );
            console.log(`Subfolders in ${rollFolder}:`, subFolders);
            if (subFolders.length === 0) {
                continue;
            }

            for (const subFolder of subFolders) {
                const assignmentMatch = subFolder.match(/tds-2025-01-ga(\d+)/);
                const assignmentNum = assignmentMatch ? assignmentMatch[1] : null;
                if (assignmentNum && question.includes(`assignment ${assignmentNum}`)) {
                    const files = fs.readdirSync(path.join(extractPath, rollFolder, subFolder));
                    console.log(`Files in ${subFolder}:`, files);
                    const questionMatch = question.match(/question (\d+)/i);
                    const questionNum = questionMatch ? questionMatch[1] : null;
                    const answerFile = files.find(f => f.startsWith(`Q${questionNum}`) && !f.endsWith('.txt') && !f.endsWith('.sh') && !f.endsWith('.js'));
                    if (answerFile) {
                        answer = getAnswerFromFile(path.join(extractPath, rollFolder, subFolder, answerFile));
                        console.log('Answer:', answer);
                        break;
                    }
                }
            }
            if (answer) break;
        }

        console.log('Cleaning up...');
        fs.rmSync(extractPath, { recursive: true, force: true });
        fs.unlinkSync(filePath);

        console.log('Response:', { answer: answer || 'Answer not found' });
        res.json({ answer: answer || 'Answer not found' });
    } catch (error) {
        console.error('Error:', error.message, error.stack);
        res.status(500).json({ answer: `Server error: ${error.message}` });
    }
});

module.exports = app;
