import {useEffect, useState} from "react";
import {ethers} from "ethers";
import ErrorMessage from "./ErrorMessage";

function timeRemaining(deadlineInSeconds) {
  const now = Math.floor(Date.now() / 1000); // Current time in seconds
  let remaining = deadlineInSeconds - now;

  if (remaining <= 0) {
      return {days:0, hours:0, minutes:0, seconds:0};
  }

  const days = Math.floor(remaining / (24 * 3600));
  remaining %= 24 * 3600;  // Factor out days
  const hours = Math.floor(remaining / 3600);
  remaining %= 3600;  // Factor out hours
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return {days, hours, minutes, seconds};
}

const CampaignDetails = ({ crowdfundContract, campaign, signer, setSigner, provider }) => {
  const [fundAmount, setFundAmount] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  const [fundsHistory, setFundsHistory] = useState([]);
  const [isOwner, setIsOwner] = useState(signer && signer.address === campaign.creator);
  const [error, setError] = useState(null);
  const [timeRemainingStr, setTimeRemainingStr] = useState("");
  const [withdrawable, setWithdrawable] = useState(0);
  const [isDeployer, setIsDeployer] = useState(false); // Contract deployer

  const {
    id,
    creator,
    goal,
    deadline,
    fundsRaised,
    isClosed,
    isStopped,
    totalContributors,
    metadata,
  } = campaign;

  const {
    description="Error loading description",
    image="blockfundr_profile.png",
    title="Error loading title",
    location="Error loading location",
  } = metadata || {}; // Default values in case metadata is null

  async function sendFunds(amount){
    let newSigner = signer;
    if (!newSigner) {
        try {
          newSigner = await provider.getSigner(0);
          console.log("Connected Signer:", newSigner);
          setSigner(newSigner);
        } catch (error) {
          console.error("Error connecting signer:", error);
          setSigner(null);
          setError(error);
          return;
        }
    }

    try {
      setIsSending(true);
      const amountInWei = ethers.parseEther(amount);
      const tx = await crowdfundContract.connect(newSigner).fundCampaign(id, { value: amountInWei });
      await tx.wait();
      console.log("Transaction successful:", tx);
      setFundAmount(0);
      // TODO: Show link to transaction on etherscan
      // window.open(`https://etherscan.io/tx/${tx.transactionHash}`, "_blank");
    } catch (error) {
      console.error("Error sending funds:", error);
      setError(error);
    } finally {
      setIsSending(false);
    }
  }

  async function withdraw() {
    try {
      setIsWithdrawing(true);
      console.log("Id", id);
      const tx = await crowdfundContract.connect(signer).withdrawFunds(id);
      // const tx = await crowdfundContract.connect(newSigner).withdrawFunds(id);
      await tx.wait();
      console.log("Withdraw successful:", tx);
    } catch (error) {
      console.error("Error withdrawing funds:", error);
      if (error.code === "ACTION_REJECTED")
        setError(new Error("User rejected request."));
      else
        setError(error);
    } finally {
      setIsWithdrawing(false);
    }
  }

  async function stopCampaign() {
    try {
      setIsStopping(true);
      const tx = await crowdfundContract.connect(signer).stop(id);
      await tx.wait();
      console.log("Campaign stopped successfully:", tx);
    } catch (error) {
      console.error("Error stopping campaign:", error);
      if (error.code === "ACTION_REJECTED")
        setError(new Error("User rejected request."));
      else
        setError(error);
    } finally {
      setIsStopping(false);
    }
  }

  // TODO: return if account has not made any contributions
  async function requestRefund() {
    try {
      setIsRefunding(true);
      const tx = await crowdfundContract.connect(signer).takeRefund(id);
      await tx.wait();
      console.log("Refund requested successfully:", tx);
    } catch (error) {
      console.error("Error requesting refund:", error);
      if (error.code === "ACTION_REJECTED")
        setError(new Error("User rejected request."));
      else
        setError(error);
    } finally {
      setIsRefunding(false);
    }
  }

  async function getFundedEvents(campaignId) {
    const events = await crowdfundContract.queryFilter(
      crowdfundContract.filters.Funded(campaignId)
    );

    const eventsObjs = await Promise.all(
      events.map(async (event) => {
        const block = await provider.getBlock(event.blockNumber);
        return {
          campaignId: event.args.campaignId.toString(),
          backer: event.args.backer,
          amount: ethers.formatEther(event.args.amount),
          transactionHash: event.transactionHash,
          timestamp: block.timestamp,
        };
      })
    );

    return eventsObjs;
  }

  async function getWithdrawableAmount(){
    try {
      const withdrawableAmount = await crowdfundContract.calculateWithdrawAmount(id);
      setWithdrawable(ethers.formatEther(withdrawableAmount));
    } catch (error){
      console.error("Error fetching withdrawable amount:", error);
      setWithdrawable(0);
    }
  }

  function getTimeRemainingStr(deadlineInSeconds){
    const timeRemainingObj = timeRemaining(deadline.toString());
    return  timeRemainingObj.days + " days " + 
            timeRemainingObj.hours + " hrs " +
            timeRemainingObj.minutes + " mins " +
            timeRemainingObj.seconds + " secs";
  }

  useEffect(() => {
    async function fetchFundingHistory() {
      try {
        const fundedEvents = await getFundedEvents(id);
        setFundsHistory(fundedEvents);
      } catch (error) {
        console.error("Error fetching funding history:", error);
      }
    }

    fetchFundingHistory();
    getWithdrawableAmount();
    if (signer)
      setIsOwner(signer.address === campaign.creator);
    else setIsOwner(false);

    setTimeRemainingStr(getTimeRemainingStr(deadline));

    let updateTimeInterval;
    if (!isClosed){
      updateTimeInterval = setInterval(()=>{
      setTimeRemainingStr(getTimeRemainingStr(deadline));
      }, 1000);
    }

    setError(null);

    return () => {
      if (!isClosed) clearInterval(updateTimeInterval);
    }
  }, [campaign]);

  useEffect(() => {
    if (!signer) {
      setIsOwner(false);
      setIsDeployer(false);
      return;
    }

    setIsOwner(signer.address === campaign.creator);

    crowdfundContract.owner().then((deployerAddress) => {
      setIsDeployer(signer.address === deployerAddress);
    }).catch((error)=> {
      console.error("Error fetching deployer address:", error);
      setIsDeployer(false);
    });

  }, [signer]);

  return (
    <div className="campaignInfoCard">
      {error && <ErrorMessage message={error.message} setErrorMessage={setError}/>}
      <h1>{title}  #{id}</h1>
      <div className="campaignInfoCard-top">
        <div className="campaignInfoCard-topleft">
          <h3><u>Campaign Description</u></h3>
          <p>{description}</p>
          <p><strong>Creator:</strong> {creator}</p>
          <p><strong>Location:</strong> {location}</p>
          <p><strong>Goal:</strong> {ethers.formatEther(goal)} ETH</p>
          <p><strong>Funds Raised:</strong> {ethers.formatEther(fundsRaised)} ETH</p>
          {isOwner && <p><strong>Withdrawable Funds:</strong> {withdrawable} ETH (95%)</p>}
          {/* TODO: Show campaign duration */}
          {isClosed ? (<p><strong>Duration:</strong> 0 days 0 hrs 0 mins 0 secs</p>) :
            (<p><strong>Time Remaining:</strong> {timeRemainingStr}</p>)
          }
          <p><strong>Backers:</strong> {totalContributors.toString()}</p>
        </div>
        <div className="campaignInfoCard-topright">
          <img src={image} alt="campaign logo" />
        </div>
      </div>
      <div className="campaignInfoCard-middle">
        {!isClosed && <input type="number" min="0" value={fundAmount} placeholder="Enter amount in Eth" onChange={(e) => {setFundAmount(e.target.value)}} />}
        <div className="camapignInfo-buttons" style={{display: "inline"}}>
          <button disabled={isSending || fundAmount <= 0 || isClosed || isStopping} onClick={() => sendFunds(fundAmount)}>
            {isSending ? "Sending..." : isStopped ? "Stopped" : isClosed ? "Stopped" : "Send Funds"}  {/* Priority left to right */}
          </button>
          {isOwner && !isClosed && (
            <button disabled={isSending || isClosed || isWithdrawing || isStopping} onClick={withdraw}>
              {isWithdrawing ? "Withdrawing..." : isClosed ? "Closed" : "Withdraw"}
            </button>
          )}
          {(isOwner || isDeployer) && !isClosed && (
            <button disabled={isSending || isClosed || isWithdrawing || isStopping} onClick={stopCampaign}>
              {isStopping ? "Stopping..." : "Stop"}
            </button>
          )}
          {isStopped && signer && !isOwner && (  // onwer can't take refund. Account must be connected to take refund
            <button disabled={isRefunding} onClick={requestRefund}>
              {isRefunding ? "Sending..." : "Request refund"} {/* TODO: show refund amount */}
            </button>
          )}
        </div>
        {(isSending || isWithdrawing || isStopping || isRefunding) && <p className="red-p">Please don't close this card</p>}
      </div>
      <br />
      <hr />
      
      {/* Show withdraw, refund, and stop txs */}
      <h2>Funding History</h2>
      <table className="funding-table">
        <thead>
          <tr>
            <th>Backer</th>
            <th>Amount (ETH)</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {[...fundsHistory].reverse().map((historyObj, index) => (
            <tr key={index}>
              <td>{historyObj.backer}</td>
              <td>{historyObj.amount.toString().slice(0, 12)}</td>
              <td>{new Date(historyObj.timestamp * 1000).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default CampaignDetails