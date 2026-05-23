import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css"; // or "./index.css" if that’s what you’re using
// This needs to match the element id in index.html (usually "root")
const rootElement = document.getElementById("root");
if (rootElement) {
 const root = ReactDOM.createRoot(rootElement);
 root.render(
<React.StrictMode>
<App />
</React.StrictMode>
 );
} else {
 // Fails loudly in case the root div is missing
 console.error('Root element with id "root" not found');
}