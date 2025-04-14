# Dataverse API Documentation Generator

This application generates interactive OpenAPI documentation for Microsoft Dataverse environments using the OData metadata endpoint.

## Project structure

dataverse-webapi-odata-browser/
│
├── .env                      # Environment variables configuration
├── package.json             # Project metadata and dependencies
├── server.js                # Main application entry point
│
├── config/                  # Configuration files
│   └── azureConfig.js       # Azure AD configuration
│
├── controllers/             # Route controllers
│   ├── authController.js    # Authentication-related routes
│   ├── apiController.js     # API documentation routes
│   └── uiController.js      # Main UI routes
│
├── middleware/              # Express middleware
│   └── authMiddleware.js    # Authentication middleware
│
├── public/                  # Static assets
│   ├── css/
│   │   └── styles.css       # Main stylesheet
│   ├── js/
│   │   ├── main.js          # Main JavaScript file
│   │   └── swagger-ui.js    # Swagger UI initialization script
│   └── images/
│       └── logo.png         # App logo
│
├── services/                # Business logic services
│   ├── dataverseService.js  # Dataverse API interaction
│   └── metadataService.js   # Metadata conversion logic
│
├── utils/                   # Utility functions
│   └── edmxConverter.js     # EDMX to OpenAPI conversion
│
├── views/                   # Handlebars templates
│   ├── layouts/
│   │   └── main.hbs         # Main layout template
│   ├── partials/
│   │   ├── header.hbs       # Header partial
│   │   └── footer.hbs       # Footer partial
│   ├── index.hbs            # Home page (login)
│   ├── dashboard.hbs        # API configuration page
│   ├── loading.hbs          # Processing indicator
│   └── error.hbs            # Error page
│
└── temp/                    # Temporary files (gitignored)
    └── openapi-spec.json    # Generated OpenAPI specification

## Setup Instructions

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `temp` directory in the project root:

```bash
mkdir temp
```

4. Start the server:

```bash
npm start
```

5. Open your browser and navigate to: `http://localhost:3000`

## How It Works

1. Sign in with your Azure AD credentials
2. Enter your Dataverse environment URL (e.g., `https://your-org.api.crm.dynamics.com/api/data/v9.2/`)
3. The application will:
   * Fetch the OData metadata from your Dataverse environment
   * Convert the EDMX XML metadata to an OpenAPI specification
   * Display interactive API documentation using Swagger UI

## Features

* **Azure AD Authentication** : Securely authenticates with your Dynamics 365/Dataverse environment
* **Automatic Metadata Processing** : Converts EDMX metadata to OpenAPI format
* **Interactive Documentation** : Explore and test your Dataverse APIs with Swagger UI
* **Bearer Token Integration** : Automatically includes your authentication token for API testing

## Troubleshooting

### JSON Metadata Format Not Supported

If you encounter an error mentioning "JSON metadata is not supported", this is normal. The application explicitly requests XML format to handle this issue.

### Schema Processing Issues

If entity sets or types aren't correctly displayed, check the server logs for details on the XML parsing process. The application attempts to handle both single and multiple entity scenarios.

### Authentication Errors

If you encounter authentication errors, verify:

* Your Azure AD app registration has the correct permissions
* The redirect URI matches your local server
* The client ID and secret are correct

## Customization

You can modify the `convertEdmxToOpenApi` function in `server.js` to customize how the OpenAPI specification is generated. The current implementation:

1. Parses the EDMX XML metadata
2. Extracts entity types and sets information
3. Converts EDM types to OpenAPI types
4. Generates paths for basic CRUD operations on each entity

## Security Note

This application includes Azure AD client credentials in the code for demonstration purposes. In a production environment, store these credentials securely using environment variables or a secret management service.

## Deployment to Digital Ocean VM (Ubuntu 22 & nginx)

1. Clone the repository on your VM
2. Install dependencies and build the app
3. Set up the app to run on a new port (3002)
4. Configure Nginx as a reverse proxy
5. Set up the subdomain in Namecheap DNS
6. Obtain SSL certificate with Let's Encrypt
7. Configure the app to run as a service

Let's get started with the detailed instructions:

### 1. Clone the Repository and Prepare the App

```bash
# SSH into your VM
ssh your-username@your-vm-ip

# Clone the repository
cd /opt
sudo mkdir dataverse-webapi-browser
sudo chown $USER:$USER dataverse-webapi-browser
cd dataverse-webapi-browser
git clone https://github.com/Cloudstrucc/dataverse-webapi-odata-browser .

# Install dependencies
npm install

# Build the app (if it's a React/Vue/Angular app)
npm run build
```

### 2. Configure the App to Run on Port 3002

Since you already have apps running on ports 3000 and 3001, let's set this one up on port 3002. You'll need to modify the port in your app's configuration.

If the repository contains a server.js or index.js file, look for where the port is defined and change it to 3002. If it's using environment variables, you can set them in a .env file:

```bash
# Create .env file
echo "PORT=3002" > .env
```

### 3. Set Up Nginx as Reverse Proxy

```bash
# Install Nginx if not already installed
sudo apt update
sudo apt install nginx -y

# Create Nginx configuration file
sudo nano /etc/nginx/sites-available/dataverse-webapi-browser.conf
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name dataverse-webapi-browser.yourdomain.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the configuration:

```bash
sudo ln -s /etc/nginx/sites-available/dataverse-webapi-browser.conf /etc/nginx/sites-enabled/
sudo nginx -t  # Test the configuration
sudo systemctl reload nginx
```

### 4. Set Up the Subdomain in Namecheap DNS

1. Log into your Namecheap account
2. Go to "Domain List" and click "Manage" next to your domain
3. Select the "Advanced DNS" tab
4. Add a new A Record:
   * Host: `dataverse-webapi-browser`
   * Value: Your DigitalOcean VM's IP address
   * TTL: Automatic

### 5. Obtain SSL Certificate with Let's Encrypt

```bash
# Install Certbot if not already installed
sudo apt install certbot python3-certbot-nginx -y

# Obtain SSL certificate
sudo certbot --nginx -d dataverse-webapi-browser.yourdomain.com
```

Follow the prompts. Certbot will automatically update your Nginx configuration to use HTTPS.

### 6. Set Up the App as a Service

This will ensure your app starts automatically when the server restarts:

```bash
sudo nano /etc/systemd/system/dataverse-webapi-browser.service
```

Add this configuration:

```ini
[Unit]
Description=Dataverse WebAPI OData Browser
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/dataverse-webapi-browser
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=PORT=3002
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl enable dataverse-webapi-browser
sudo systemctl start dataverse-webapi-browser
sudo systemctl status dataverse-webapi-browser
```

### 7. Monitor and Test

Check if your application is running correctly:

```bash
# Check the status of your service
sudo systemctl status dataverse-webapi-browser

# Check the logs if there are issues
sudo journalctl -u dataverse-webapi-browser
```

Visit https://dataverse-webapi-browser.yourdomain.com in your browser to ensure everything is working.

### Additional Notes

* You may need to adjust file paths and specific commands based on the structure of your repository.
* Make sure your DigitalOcean firewall allows HTTP (port 80) and HTTPS (port 443) traffic.
* The Let's Encrypt certificate will auto-renew through a cronjob that Certbot sets up.
