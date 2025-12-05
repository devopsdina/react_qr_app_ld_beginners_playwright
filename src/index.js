import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { asyncWithLDProvider } from "launchdarkly-react-client-sdk";
import * as LDClient from "launchdarkly-js-client-sdk";
import { deviceType, osName, browserName  } from "react-device-detect";
import getUserId from "./util/getUserId";
import getClientKey from "./util/getClientKey";
import KeyForm from "./components/keyForm";

const CLIENT_KEY = getClientKey();

let id = getUserId();

(async () => {

  if (!CLIENT_KEY) {
    ReactDOM.render(
      <div>
        <KeyForm/>
      </div>,
      document.getElementById("root")
    );    
  } else {
    // Configuration options for CloudFront proxy
    // Option 1: Set via environment variable REACT_APP_USE_CLOUDFRONT_PROXY=true
    // Option 2: Change the boolean below to true/false
    const useCloudFrontProxy = true; // Re-enable CloudFront proxy with React SDK
    
    // CloudFront distribution domain
    const cloudFrontDomain = 'https://dhmotfv99i6iw.cloudfront.net';

    
    const LDProvider = await (async () => {
      if (useCloudFrontProxy) {
        console.log('🔧 Using React SDK with CloudFront proxy...');
        
        // Use React SDK directly with CloudFront proxy configuration
        return await asyncWithLDProvider({
          clientSideID: CLIENT_KEY,
          context: {
            kind: "device",
            key: id,
            device: deviceType,
            operatingSystem: osName,
            browserName: browserName
          },
          options: {
            streaming: true,
            timeout: 1
          }
        });
      } else {
        console.log('🔧 Using asyncWithLDProvider with direct LaunchDarkly connection...');
        
        // Use the React SDK's asyncWithLDProvider for direct connection
        return await asyncWithLDProvider({
          clientSideID: CLIENT_KEY,
          sendEventsOnlyForVariation: true,
          context: {
            kind: "device",
            key: id,
            device: deviceType,
            operatingSystem: osName,
            browserName: browserName
          },
          options: {
            timeout: 1 
          }
        });
      }
    })();

    ReactDOM.render(
      <LDProvider>
        <App />
      </LDProvider>,
      document.getElementById("root")
    );
  }
})();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
