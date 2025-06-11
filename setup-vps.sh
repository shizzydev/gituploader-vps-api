#!/bin/bash

echo "🚀 Setting up GitUploader VPS API Server..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install Node.js (using NodeSource repository)
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Git
echo "📦 Installing Git..."
sudo apt-get install -y git

# Install PM2 for process management
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Create project directory
echo "📁 Creating project directory..."
mkdir -p ~/gituploader-api
cd ~/gituploader-api

# Create package.json
cat > package.json << 'EOF'
{
  "name": "gituploader-vps-api",
  "version": "1.0.0",
  "description": "VPS API server for GitUploader",
  "main": "vps-server.js",
  "scripts": {
    "start": "node vps-server.js",
    "dev": "nodemon vps-server.js",
    "pm2": "pm2 start vps-server.js --name gituploader-api"
  },
  "dependencies": {
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
EOF

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Download the server file (you'll need to create this manually)
echo "📝 Please create the vps-server.js file with the provided code"

# Configure firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 3001/tcp
sudo ufw allow ssh
sudo ufw --force enable

# Create systemd service (alternative to PM2)
sudo tee /etc/systemd/system/gituploader-api.service > /dev/null << EOF
[Unit]
Description=GitUploader API Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$HOME/gituploader-api
ExecStart=/usr/bin/node vps-server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Create vps-server.js with the provided code"
echo "2. Test the server: npm start"
echo "3. Start with PM2: npm run pm2"
echo "4. Or use systemd: sudo systemctl enable gituploader-api && sudo systemctl start gituploader-api"
echo ""
echo "🔗 Your API will be available at: http://YOUR_VPS_IP:3001"
echo "🏥 Health check: http://YOUR_VPS_IP:3001/health"