const express = require('express');
const multer = require('multer');
const ADMZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: '/tmp/uploads/' }); // Use /tmp for Vercel

const uploadDir = '/tmp/uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.post('/', upload.single('file'), (req, res) => {
    try {
        const question = req.body.question ? req.body.question.toLowerCase() : 'no question provided';
        let answer = '';

        if (!req.file) {
            return res.status(400).json({ answer: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const extractPath = '/tmp/extracted';

        if (!fs.existsSync(filePath)) {
            return res.status(500).json({ answer: 'Uploaded file not found on server' });
        }

        const zip = new ADMZip(filePath);
        if (!fs.existsSync(extractPath)) {
            fs.mkdirSync(extractPath, { recursive: true });
        }
        zip.extractAllTo(extractPath, true);

        const extractedFiles = fs.readdirSync(extractPath);
        if (extractedFiles.length === 0) {
            return res.status(500).json({ answer: 'ZIP extraction failed - no files found' });
        }

        const getAnswerFromFile = (filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            const content = fs.readFileSync(filePath, 'utf8');
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
        if (rollFolders.length === 0) {
            return res.status(500).json({ answer: 'No RollNo_X folders found' });
        }

        for (const rollFolder of rollFolders) {
            const subFolders = fs.readdirSync(path.join(extractPath, rollFolder)).filter(f => 
                f.startsWith('tds-2025-01-ga') && fs.statSync(path.join(extractPath, rollFolder, f)).isDirectory()
            );
            if (subFolders.length === 0) {
                continue;
            }

            for (const subFolder of subFolders) {
                const files = fs.readdirSync(path.join(extractPath, rollFolder, subFolder));
                const answerFile = files.find(f => f.startsWith('answer') && !f.endsWith('.txt'));
                if (answerFile) {
                    answer = getAnswerFromFile(path.join(extractPath, rollFolder, subFolder, answerFile));
                    break;
                }
            }
            if (answer) break;
        }

        fs.rmSync(extractPath, { recursive: true, force: true });
        fs.unlinkSync(filePath);

        res.json({ answer: answer || 'Answer not found' });
    } catch (error) {
        res.status(500).json({ answer: `Server error: ${error.message}` });
    }
});

module.exports = app;
