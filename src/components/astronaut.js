import { withLDConsumer } from "launchdarkly-react-client-sdk";
import astronaut from "./../images/astronaut.png";
import oldastronaut from "./../images/astronaut_old.png";

const astronautLogo = ({ ldClient }) => {
  let releaseAstronaut = ldClient.variation("release-astronaut", true);

  return releaseAstronaut ? (
  <div>
    <img src={astronaut} className="astronaut-logo" alt="logo" />
  </div>
  ) : (
  <div>
    <img src={oldastronaut} className="astronaut-logo" alt="logo" />
  </div>
  );
};

export default withLDConsumer()(astronautLogo);

