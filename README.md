# TraceFlow

A powerful Chrome extension for monitoring and debugging HTTP requests in real-time.

## Features

- **Real-time Request Monitoring**
  - Captures all HTTP requests made by your browser
  - Displays method, URL, status, and timing information
  - Shows query parameters separately for better visibility

- **Detailed Request Information**
  - Full URL with query parameters
  - Request method and timestamp
  - Status code with visual indicators
  - Request payload (body)
  - Response body

- **Advanced Filtering**
  - Quick search through requests by URL, method, or status
  - Filter requests by status type:
    - All requests
    - Success (200-399)
    - Error (400+)
  - Combine text search with status filters

- **User Experience**
  - Clean and modern interface
  - Dark/Light theme support
  - Expandable request cards
  - Copy buttons for request/response data
  - Maximum height containers with scroll for large payloads
  - Smooth animations and transitions

## Installation

1. Clone this repository
```bash
git clone https://github.com/brendogomes/TraceFlow.git
```

2. Install dependencies
```bash
cd TraceFlow
npm install
```

3. Build the extension
```bash
npm run build
```

4. Load in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `public` folder from this project

## Development

- Start development server:
```bash
npm run dev
```

- Build for production:
```bash
npm run build
```

## Tech Stack

- **Svelte** - Frontend framework
- **Tailwind CSS** - Styling
- **Chrome Extensions API** - Browser integration
- **Rollup** - Bundling

## Permissions

The extension requires the following permissions:
- `activeTab` - Access to the active tab
- `webRequest` - Monitor web requests
- `storage` - Store extension data
- `tabs` - Access browser tabs

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.