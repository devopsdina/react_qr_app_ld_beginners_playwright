import QRCode from "react-qr-code";
import { withLDConsumer } from "launchdarkly-react-client-sdk";

// No more hard-coding: just use the current URL
let QR_URL = document.location.toString();

const qrCodeHome = ({ ldClient }) => {
  let showQrCode = ldClient.variation("show-qr-code", false);

  return showQrCode ? (
    <div>
      <br />
      <span style={{ color: 'black' }}><center>Scan me!</center></span>
      <div className="qr-wrapper">
        <QRCode value={QR_URL} />
      </div>
    </div>
  ) : (
    <div></div>
  );
};

export default withLDConsumer()(qrCodeHome);