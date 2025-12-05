import { withLDConsumer } from "launchdarkly-react-client-sdk";

const customerLogo = ({ ldClient }) => {
  // When using the underlying Javascript SDK, flag keys with dashes and periods are used normally
  let showCustomerLogo = ldClient.variation("show-customer-logo", false);
  let logo = ldClient.variation("config-customer-logo", "");

  return showCustomerLogo ? (
  <div>
    <img src={logo} className="customer-logo" alt="customerLogo" />
  </div>
  ) : (
  <div />
  );
};

export default withLDConsumer()(customerLogo);