import { withLDConsumer } from "launchdarkly-react-client-sdk";
import heart from "./../images/heart.svg";

const showHeart = ({ ldClient }) => {
  let releaseHeart = ldClient.variation("release-heart", false);

  return releaseHeart ? (
  <div>
    <img src={heart} className="heart" alt="heart" />
  </div>
  ) : (
  <div />
  );
};

export default withLDConsumer()(showHeart);