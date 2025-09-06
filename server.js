// server.js - Render Compatible Version
const http = require('http');
const fs = require('fs');
const path = require('path');

console.log('Starting CloudVault server...');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    console.log('Creating uploads directory...');
    try {
        fs.mkdirSync(uploadDir);
        console.log('Uploads directory created successfully');
    } catch (err) {
        console.error('Error creating uploads directory:', err);
    }
} else {
    console.log('Uploads directory already exists');
}

// JSON file for storing file metadata
const DATA_FILE = './cloudvault-data.json';

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        files: [
            { id: 1, name: "Project_Report.pdf", type: "pdf", size: "2.4 MB", date: "2023-05-15", path: "uploads/project-report.pdf" },
            { id: 2, name: "Vacation_Photos.zip", type: "zip", size: "15.2 MB", date: "2023-06-22", path: "uploads/vacation-photos.zip" },
            { id: 3, name: "Financial_Spreadsheet.xlsx", type: "xlsx", size: "1.1 MB", date: "2023-07-10", path: "uploads/financial-spreadsheet.xlsx" }
        ]
    }, null, 2));
    console.log('Created data file with sample files');
}

// Load data from JSON file
function loadData() {
    try {
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading data file:', err);
        return { files: [] };
    }
}

// Save data to JSON file
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error('Error saving data file:', err);
        return false;
    }
}

// Helper functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function parseFileSize(sizeStr) {
    const unit = sizeStr.split(' ')[1];
    const value = parseFloat(sizeStr.split(' ')[0]);
    
    switch(unit) {
        case 'Bytes': return value;
        case 'KB': return value * 1024;
        case 'MB': return value * 1024 * 1024;
        case 'GB': return value * 1024 * 1024 * 1024;
        default: return 0;
    }
}

function getTotalStorageUsed() {
    try {
        const data = loadData();
        return data.files.reduce((total, file) => {
            return total + parseFileSize(file.size);
        }, 0);
    } catch (err) {
        console.error('Error calculating storage:', err);
        return 0;
    }
}

function bytesToGB(bytes) {
    return (bytes / (1024 * 1024 * 1024)).toFixed(2);
}

function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Proper multipart parser
function parseMultipart(req, callback) {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
        return callback(new Error('Not multipart data'));
    }
    
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
        return callback(new Error('No boundary found'));
    }
    
    const chunks = [];
    req.on('data', chunk => {
        chunks.push(chunk);
    });
    
    req.on('end', () => {
        try {
            const buffer = Buffer.concat(chunks);
            const boundaryBytes = Buffer.from('--' + boundary);
            const boundaryEndBytes = Buffer.from('--' + boundary + '--');
            
            // Find the file part
            let fileStartIndex = -1;
            let fileEndIndex = -1;
            let filename = '';
            
            // Look for filename in the buffer
            const bufferStr = buffer.toString('binary');
            const filenameMatch = bufferStr.match(/filename="([^"]+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
            
            // Find the start of file data (after headers)
            const headerEnd = bufferStr.indexOf('\r\n\r\n');
            if (headerEnd === -1) {
                return callback(new Error('Invalid multipart format'));
            }
            
            fileStartIndex = headerEnd + 4;
            
            // Find the end of file data (before boundary)
            fileEndIndex = buffer.lastIndexOf(boundaryBytes);
            if (fileEndIndex === -1) {
                fileEndIndex = buffer.lastIndexOf(boundaryEndBytes);
            }
            
            if (fileEndIndex === -1 || fileStartIndex >= fileEndIndex) {
                return callback(new Error('Could not find file boundaries'));
            }
            
            // Extract file data
            const fileData = buffer.slice(fileStartIndex, fileEndIndex - 2); // -2 to remove \r\n before boundary
            
            // Save file
            const uniqueName = `${generateUniqueId()}-${filename}`;
            const filePath = path.join('uploads', uniqueName);
            const fullFilePath = path.join(__dirname, filePath);
            
            fs.writeFile(fullFilePath, fileData, (err) => {
                if (err) {
                    return callback(err);
                }
                
                callback(null, {
                    originalname: filename,
                    path: filePath,
                    size: fileData.length
                });
            });
        } catch (err) {
            callback(err);
        }
    });
}

// Send JSON response
function sendJSON(res, data, statusCode = 200) {
    const jsonData = JSON.stringify(data);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Length': Buffer.byteLength(jsonData)
    });
    res.end(jsonData);
}

// Serve static files
function serveStaticFile(res, filePath) {
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404, { 
                'Content-Type': 'text/html',
                'Content-Length': 45
            });
            res.end('<h1>404 Not Found</h1><p>File not found.</p>');
            return;
        }
        
        // Determine content type
        const ext = path.extname(filePath);
        let contentType = 'text/html';
        
        switch (ext) {
            case '.js': contentType = 'text/javascript'; break;
            case '.css': contentType = 'text/css'; break;
            case '.json': contentType = 'application/json'; break;
            case '.png': contentType = 'image/png'; break;
            case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
            case '.ico': contentType = 'image/x-icon'; break;
            case '.svg': contentType = 'image/svg+xml'; break;
        }
        
        // Read and serve the file
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500, { 
                    'Content-Type': 'text/html',
                    'Content-Length': 58
                });
                res.end('<h1>500 Internal Server Error</h1><p>Error reading file.</p>');
                return;
            }
            
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': data.length,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(data);
        });
    });
}

// Request handler
function requestHandler(req, res) {
    const url = req.url;
    const method = req.method;
    
    // Handle CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Length': 0
        });
        res.end();
        return;
    }
    
    // API routes - CHECK FIRST
    if (url.startsWith('/api/')) {
        // Test endpoint
        if (url === '/api/test' && method === 'GET') {
            sendJSON(res, { message: 'API is working' });
            return;
        }
        
        // Get all files
        if (url === '/api/files' && method === 'GET') {
            const data = loadData();
            sendJSON(res, data.files);
            return;
        }
        
        // Get storage info
        if (url === '/api/storage' && method === 'GET') {
            const usedBytes = getTotalStorageUsed();
            const totalBytes = 25 * 1024 * 1024 * 1024; // 25GB
            const usedGB = bytesToGB(usedBytes);
            const totalGB = 25;
            const percentage = ((usedBytes / totalBytes) * 100).toFixed(2);
            
            sendJSON(res, {
                used: `${usedGB} GB`,
                total: `${totalGB} GB`,
                percentage: parseFloat(percentage)
            });
            return;
        }
        
        // Upload file
        if (url === '/api/upload' && method === 'POST') {
            parseMultipart(req, (err, file) => {
                if (err) {
                    console.error('Upload error:', err);
                    sendJSON(res, { error: 'Upload failed: ' + err.message }, 500);
                    return;
                }
                
                if (!file) {
                    sendJSON(res, { error: 'No file uploaded' }, 400);
                    return;
                }
                
                const usedBytes = getTotalStorageUsed();
                const totalBytes = 25 * 1024 * 1024 * 1024;
                const fileSize = file.size;
                
                if (usedBytes + fileSize > totalBytes) {
                    try {
                        const fullPath = path.join(__dirname, file.path);
                        if (fs.existsSync(fullPath)) {
                            fs.unlinkSync(fullPath);
                        }
                    } catch (e) {}
                    sendJSON(res, { error: 'Storage limit exceeded (25GB)' }, 400);
                    return;
                }
                
                const newFile = {
                    id: Date.now(), // Simple ID generation
                    name: file.originalname,
                    type: file.originalname.split('.').pop() || 'unknown',
                    size: formatFileSize(file.size),
                    date: new Date().toISOString().split('T')[0],
                    path: file.path
                };
                
                // Load current data
                const data = loadData();
                data.files.push(newFile);
                
                // Save updated data
                if (saveData(data)) {
                    sendJSON(res, { message: 'File uploaded successfully', file: newFile });
                } else {
                    sendJSON(res, { error: 'Failed to save file info' }, 500);
                }
            });
            return;
        }
        
        // Download file
        if (url.startsWith('/api/download/') && method === 'GET') {
            try {
                const fileId = parseInt(url.split('/')[3]);
                const data = loadData();
                const file = data.files.find(f => f.id === fileId);
                
                if (!file) {
                    sendJSON(res, { error: 'File not found in database' }, 404);
                    return;
                }
                
                // Construct full absolute path
                const fullPath = path.join(__dirname, file.path);
                
                // Check if file exists
                fs.access(fullPath, fs.constants.F_OK, (err) => {
                    if (err) {
                        sendJSON(res, { error: 'File not found on disk' }, 404);
                        return;
                    }
                    
                    // Get file stats
                    fs.stat(fullPath, (err, stats) => {
                        if (err) {
                            sendJSON(res, { error: 'Error accessing file' }, 500);
                            return;
                        }
                        
                        // Set headers for file download
                        res.writeHead(200, {
                            'Content-Type': 'application/octet-stream',
                            'Content-Length': stats.size,
                            'Content-Disposition': `attachment; filename="${file.name}"`
                        });
                        
                        // Stream the file
                        const readStream = fs.createReadStream(fullPath);
                        
                        // Handle stream events
                        readStream.on('error', (err) => {
                            if (!res.headersSent) {
                                sendJSON(res, { error: 'Error reading file' }, 500);
                            }
                        });
                        
                        readStream.pipe(res);
                    });
                });
            } catch (err) {
                sendJSON(res, { error: 'Download failed: ' + err.message }, 500);
            }
            return;
        }
        
        // Delete file
        if (url.startsWith('/api/files/') && method === 'DELETE') {
            try {
                const fileId = parseInt(url.split('/')[3]);
                const data = loadData();
                const fileIndex = data.files.findIndex(f => f.id === fileId);
                
                if (fileIndex === -1) {
                    sendJSON(res, { error: 'File not found' }, 404);
                    return;
                }
                
                const file = data.files[fileIndex];
                
                // Remove from data
                const deletedFile = data.files.splice(fileIndex, 1)[0];
                
                // Save updated data
                if (!saveData(data)) {
                    // Add file back if save failed
                    data.files.splice(fileIndex, 0, deletedFile);
                    sendJSON(res, { error: 'Failed to update database' }, 500);
                    return;
                }
                
                // Delete file from disk
                const fullPath = path.join(__dirname, file.path);
                fs.unlink(fullPath, (err) => {
                    if (err) {
                        console.error('Error deleting file from disk:', err);
                    }
                    // Still return success even if disk deletion fails
                    sendJSON(res, { message: 'File deleted successfully' });
                });
            } catch (err) {
                sendJSON(res, { error: 'Deletion failed' }, 500);
            }
            return;
        }
        
        // 404 for unknown API routes
        sendJSON(res, { error: 'API endpoint not found' }, 404);
        return;
    }
    
    // Serve index.html for root path
    if (url === '/' && method === 'GET') {
        serveStaticFile(res, path.join(__dirname, 'public', 'index.html'));
        return;
    }
    
    // Serve static assets
    if (method === 'GET' && url.startsWith('/')) {
        const cleanUrl = url.substring(1);
        serveStaticFile(res, path.join(__dirname, 'public', cleanUrl));
        return;
    }
    
    // 404 for everything else
    res.writeHead(404, { 
        'Content-Type': 'text/html',
        'Content-Length': 52
    });
    res.end('<h1>404 Not Found</h1><p>Resource not found.</p>');
}

// Start server
const PORT = process.env.PORT || 3000;
const server = http.createServer(requestHandler);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n========================================`);
    console.log(`CloudVault server running on port ${PORT}`);
    console.log(`Storage capacity: 25GB`);
    console.log(`Using JSON file storage for file metadata`);
    console.log(`Open http://localhost:${PORT} in your browser`);
    console.log(`========================================\n`);
});

server.on('error', (err) => {
    console.error('Server error:', err);
});