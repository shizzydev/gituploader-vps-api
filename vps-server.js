const express = require('express');
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = 3001;

// Middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-API-Key');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Simple API key authentication (optional)
const API_KEY = 'your-secure-api-key-here'; // Change this!

const authenticateAPI = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === API_KEY) {
    next();
  } else {
    // Skip authentication for now - you can enable it later
    next();
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Main upload endpoint
app.post('/api/upload', authenticateAPI, async (req, res) => {
  let tempDir = null;
  
  try {
    const { files, repoUrl, token, commitMessage } = req.body;
    
    if (!files || !repoUrl || !token) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: files, repoUrl, or token'
      });
    }

    console.log(`📦 Processing upload for ${repoUrl}`);
    console.log(`📁 Files to process: ${files.length}`);

    // Extract repo info
    const repoMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!repoMatch) {
      return res.status(400).json({
        success: false,
        error: 'Invalid GitHub repository URL'
      });
    }

    const [, owner, repoName] = repoMatch;
    const repo = repoName.replace('.git', '');

    // Create temporary directory
    const projectId = `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    tempDir = path.join('/tmp', projectId);
    
    await fs.mkdir(tempDir, { recursive: true });
    console.log(`📂 Created temp directory: ${tempDir}`);

    // Write files to temp directory
    for (const file of files) {
      const filePath = path.join(tempDir, file.path);
      const fileDir = path.dirname(filePath);
      
      // Create directory structure
      await fs.mkdir(fileDir, { recursive: true });
      
      // Write file content
      if (file.isText && !file.content.match(/^[A-Za-z0-9+/]*={0,2}$/)) {
        // It's plain text content
        await fs.writeFile(filePath, file.content, 'utf8');
      } else {
        // It's base64 encoded content
        const buffer = Buffer.from(file.content, 'base64');
        await fs.writeFile(filePath, buffer);
      }
      
      console.log(`✅ Written: ${file.path}`);
    }

    // Create authenticated GitHub URL
    const authUrl = repoUrl.replace('https://', `https://${token}@`);

    // Git operations
    const gitCommands = [
      'git init',
      'git config user.name "GitUploader"',
      'git config user.email "uploader@gituploader.com"',
      'git add .',
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
      `git remote add origin ${authUrl}`,
      'git branch -M main',
      'git push -f origin main'
    ];

    console.log('🔧 Starting Git operations...');
    
    let gitOutput = '';
    
    // Execute git commands one by one
    for (const command of gitCommands) {
      try {
        console.log(`⚡ Executing: ${command.replace(token, '***')}`);
        const { stdout, stderr } = await execAsync(command, { 
          cwd: tempDir,
          timeout: 30000 // 30 second timeout per command
        });
        
        if (stdout) {
          gitOutput += `${command}: ${stdout}\n`;
          console.log(`✅ ${command}: ${stdout.trim()}`);
        }
        if (stderr && !stderr.includes('warning')) {
          gitOutput += `${command} (stderr): ${stderr}\n`;
          console.log(`⚠️  ${command}: ${stderr.trim()}`);
        }
      } catch (error) {
        // If main branch fails, try master
        if (command === 'git push -f origin main') {
          try {
            console.log('⚡ Trying master branch...');
            const { stdout, stderr } = await execAsync('git push -f origin master', { 
              cwd: tempDir,
              timeout: 30000
            });
            gitOutput += `git push master: ${stdout}\n`;
            console.log(`✅ Push to master: ${stdout.trim()}`);
          } catch (masterError) {
            throw new Error(`Git push failed for both main and master: ${error.message}`);
          }
        } else {
          throw new Error(`Git command failed (${command}): ${error.message}`);
        }
      }
    }

    console.log('🎉 Git operations completed successfully!');

    res.json({
      success: true,
      filesUploaded: files.length,
      output: gitOutput,
      message: `Successfully uploaded ${files.length} files to ${owner}/${repo}`
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Upload failed',
      details: error.stack
    });
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        await execAsync(`rm -rf ${tempDir}`);
        console.log(`🧹 Cleaned up temp directory: ${tempDir}`);
      } catch (cleanupError) {
        console.error('⚠️  Cleanup error:', cleanupError);
      }
    }
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 GitUploader VPS API Server running on port ${PORT}`);
  console.log(`📡 Listening on all interfaces (0.0.0.0:${PORT})`);
  console.log(`🔗 Health check: http://your-vps-ip:${PORT}/health`);
  console.log(`📤 Upload endpoint: http://your-vps-ip:${PORT}/api/upload`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});