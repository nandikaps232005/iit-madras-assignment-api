const express = require('express');
const multer = require('multer');
const ADMZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

app.post('/', upload.single('file'), (req, res) => {
    try {
        console.log('Request received:', req.body, req.file);
        const question = req.body.question.toLowerCase();
        let answer = '';

        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({ answer: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const extractPath = path.join(__dirname, 'extracted');

        console.log('Unzipping file:', filePath);
        const zip = new ADMZip(filePath);
        if (!fs.existsSync(extractPath)) {
            fs.mkdirSync(extractPath);
        }
        zip.extractAllTo(extractPath, true);
        console.log('File unzipped to:', extractPath);

        const getAnswerFromFile = (filePath) => {
            const ext = path.extname(filePath).toLowerCase();
            const content = fs.readFileSync(filePath, 'utf8');
            console.log(`Reading file: ${filePath}, extension: ${ext}`);

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

        const rollFolders = fs.readdirSync(extractPath).filter(f => 
            f.startsWith('RollNo_') && fs.statSync(path.join(extractPath, f)).isDirectory()
        );
        console.log('Roll folders found:', rollFolders);

        for (const rollFolder of rollFolders) {
            const subFolders = fs.readdirSync(path.join(extractPath, rollFolder)).filter(f => 
                f.startsWith('tds-2025-01-ga') && fs.statSync(path.join(extractPath, rollFolder, f)).isDirectory()
            );
            console.log(`Subfolders in ${rollFolder}:`, subFolders);

            for (const subFolder of subFolders) {
                const assignmentNum = subFolder.match(/ga(\d)/)?.[1];
                if (question.includes(`assignment ${assignmentNum}`) || question.includes(`ga${assignmentNum}`)) {
                    const folderPath = path.join(extractPath, rollFolder, subFolder);
                    const files = fs.readdirSync(folderPath);
                    console.log(`Files in ${folderPath}:`, files);

                    for (const file of files) {
                        if (file.startsWith('answer') && !file.endsWith('.txt')) {
                            const fileName = file.replace(/\.[^/.]+$/, '');
                            if (question.includes(fileName.toLowerCase()) || question.includes(fileName.replace('answer', '').toLowerCase())) {
                                const fullPath = path.join(folderPath, file);
                                answer = getAnswerFromFile(fullPath);
                                console.log(`Answer found in ${fullPath}:`, answer);
                                break;
                            }
                        }
                    }
                    if (answer) break;
                }
            }
            if (answer) break;
        }

        console.log('Final answer:', answer);
        fs.rmSync(extractPath, { recursive: true, force: true });
        fs.unlinkSync(filePath);

        res.json({ answer: answer || 'Answer not found' });
    } catch (error) {
        console.error('Error processing request:', error.stack);
        res.status(500).json({ answer: 'Error processing question' });
    }
});

module.exports = app;
