import { useState, useEffect, useRef } from 'react'
import { ethers } from "ethers";

// TODO: Handle files not found(same as handling contract not deployed)
import crowdfundArtifact from "./contracts/Crowdfund.json";
import contractAddress from "./contracts/contract-address.json";

import NavBar from './components/NavBar.jsx'
import Card from './components/Card.jsx'
import NewCampaignForm from './components/NewCampaignForm.jsx';
import CampaignInfoCard from './components/CampaignInfoCard';
import NoWalletDetected from './components/NoWalletDetected';
import ErrorMessage from './components/ErrorMessage.jsx';

const HARDHAT_NETWORK_ID = '31337';

function App() {
  const [walletDetected, setWalletDetected] = useState(true);
  const [provider, setProvider] = useState(null);
  const [crowdfundContract, setCrowdfundContract] = useState(null);
  const [address, setAddress] = useState("");
  const [signer, setSigner] = useState(null);
  const [totalActiveCampaigns, setTotalCampaigns] = useState(0);
  const [totalClosedCampaigns, setTotalClosedCampaigns] = useState(0);
  const [campaigns, setCampaigns] = useState([]);
  const [closedCampaigns, setClosedCampaigns] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loadingNewCampaign, setLoadingNewCampaign] = useState(false);
  const [showCampaignInfo, setShowCampaignInfo] = useState(null);
  const [walletError, setWalletError] = useState(null);
  const [initError, setInitError] = useState(null);
  
  const campaignInfoRef = useRef(null);
  
  const scrollToCampaignInfo = () => {
    if (campaignInfoRef.current) {
      campaignInfoRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  async function createCard(crowdfundContract){
    if (!crowdfundContract) {
      console.error("Crowdfund contract is not initialized");
      return;
    }
    
    const totalCampaigns = await crowdfundContract.campaignCount();

    const campaign = await crowdfundContract.campaigns(totalCampaigns - 1n); // index of campaign
    const campaignObj = {
      id: campaign[0],
      creator: campaign[1],
      metadataUrl: campaign[2],
      goal: campaign[3],
      deadline: campaign[4],
      fundsRaised: campaign[5],
      totalContributors: campaign[6],
      isClosed: campaign[7],
      isStopped: false,  // new campaigns are not stopped
    }

    // Maybe in hardhat localhost, since blocks are not getting created until when a tx
    // happens, modifying this file leads to rerunning this func even though a new CampaignCreated
    // event is not fired. Maybe it is bcoz modifying the file leads to requerying the local provider
    // and since a new block is not added, the old one (if it has the event) will make this func fire.
    // THis 'if' block is taking care of that. THIS IS JUST AN EMPIRICALLY. Does it apply to main/test nets.
    setTotalCampaigns(totalCampaigns.toString());
    setCampaigns((prev)=>{
      if (prev.length < totalCampaigns.toString())
        return [...prev, campaignObj]
      else
        return prev
    });
  }

  useEffect(() => {
    if (window.ethereum === undefined) setWalletDetected(false);
    else {
      try {
        setWalletDetected(true);
        const provider = new ethers.BrowserProvider(window.ethereum);
        setProvider(provider);

        const network = provider.getNetwork();
        network.then((val) => {
          console.log("Network", val)
        });

        const code = provider.getCode(contractAddress.Crowdfund);
        // TODO: show loading message while waiting to resolve
        code.then((val) => {
          try {
            if (val !== '0x'){
              const crowdfundContract = new ethers.Contract(contractAddress.Crowdfund, crowdfundArtifact.abi, provider);
              setCrowdfundContract(crowdfundContract);
            } else {
              throw new Error(`No contract deployed at ${contractAddress.Crowdfund}`);
            }
          } catch (error) {
            console.error("Error getting contract:", error);
            setInitError(error);
            const reload = setInterval(() => {
              console.log("Retrying to connect to contract...");
              const code = provider.getCode(contractAddress.Crowdfund);
              code.then((val) => {
                if (val !== '0x'){
                  const crowdfundContract = new ethers.Contract(contractAddress.Crowdfund, crowdfundArtifact.abi, provider);
                  setCrowdfundContract(crowdfundContract);
                  setInitError(null);
                  clearInterval(reload);
                } else {
                  setInitError(error);
                }
              });
            }, 10000);
          }
        }); 
      } catch (error) {
        console.error("Error connecting to provider:", error);
        setInitError(error);
      }
    }
  }, [])

  useEffect(() => {
    async function getCampaignsCount(){
      let totalCampaigns = await crowdfundContract.campaignCount();
      let totalClosedCampaigns = await crowdfundContract.closedCampaigns();
      let totalActiveCampaigns = totalCampaigns - totalClosedCampaigns;

      totalCampaigns = totalCampaigns.toString();
      totalActiveCampaigns = totalActiveCampaigns.toString();
      totalClosedCampaigns = totalClosedCampaigns.toString();

      return { totalCampaigns, totalActiveCampaigns, totalClosedCampaigns };
    }

    async function loadCampaigns(){
      try {
        const { totalCampaigns, totalActiveCampaigns, totalClosedCampaigns } = await getCampaignsCount();
        setTotalCampaigns(totalActiveCampaigns);
        setTotalClosedCampaigns(totalClosedCampaigns);

        // TODO: use Promise.all here to load faster
        const loadedCampaigns = [];
        const closedLoadedCampaigns = [];

        for (let i=0;i<totalCampaigns;i++){
          const campaign = await crowdfundContract.campaigns(i);

          const campaignObj = {
            id: campaign[0],
            creator: campaign[1],
            metadataUrl: campaign[2],
            goal: campaign[3],
            deadline: campaign[4],
            fundsRaised: campaign[5],
            totalContributors: campaign[6],
            isClosed: campaign[7],
          }

          const isStopped = await crowdfundContract.isStopped(campaignObj.id);
          campaignObj.isStopped = isStopped;

          if (campaignObj.isClosed) closedLoadedCampaigns.push(campaignObj);
          else loadedCampaigns.push(campaignObj);
        }
        
        setCampaigns(loadedCampaigns);
        setClosedCampaigns(closedLoadedCampaigns);
      } catch (error) {
        console.error("Error loading campaigns from contract:", error);
        setInitError(error);
      }
    }

    if (crowdfundContract) {
      console.log("Loading prev campaigns");
      loadCampaigns();

      crowdfundContract.on("CampaignCreated", async () => {
        await createCard(crowdfundContract); // Will work without await?
      });

      crowdfundContract.on("Funded", async (campaignId, backer, amount) => {
        console.log("Funded event:", {campaignId, backer, amount});
        const fundedCampaign = await crowdfundContract.campaigns(campaignId);
        const fundedCampaignObj = {
          id: fundedCampaign[0],
          creator: fundedCampaign[1],
          metadataUrl: fundedCampaign[2],
          goal: fundedCampaign[3],
          deadline: fundedCampaign[4],
          fundsRaised: fundedCampaign[5],
          totalContributors: fundedCampaign[6],
          isClosed: fundedCampaign[7],
          isStopped: false,  // fundable campaigns are not stopped
        }

        setCampaigns((prev) => {
          const updatedCampaigns = [...prev];
          const campaignIndex = updatedCampaigns.findIndex((campaign) => campaign.id === campaignId);
          updatedCampaigns[campaignIndex] = fundedCampaignObj;
          return updatedCampaigns;
        });
      });      

      crowdfundContract.on("Withdrawn", async (campaignId, creator, amount) => {
        console.log("Withdrawn event:", {campaignId, creator, amount});
        const withdrawnCampaign = await crowdfundContract.campaigns(campaignId);
        const withdrawnCampaignObj = {
          id: withdrawnCampaign[0],
          creator: withdrawnCampaign[1],
          metadataUrl: withdrawnCampaign[2],
          goal: withdrawnCampaign[3],
          deadline: withdrawnCampaign[4],
          fundsRaised: withdrawnCampaign[5],
          totalContributors: withdrawnCampaign[6],
          isClosed: withdrawnCampaign[7],
          isStopped: false,
        }

        const { totalActiveCampaigns, totalClosedCampaigns } = await getCampaignsCount();
        setTotalCampaigns(totalActiveCampaigns);
        setTotalClosedCampaigns(totalClosedCampaigns);

        setClosedCampaigns((prev) => {
          return [...prev, withdrawnCampaignObj];
        });
        
        setCampaigns((prev) => {
          return prev.filter((el) => el.id !== campaignId);
        })
        setShowCampaignInfo(null); // closing the currently opened campaign because it will change group/list
      });

      crowdfundContract.on("Stopped", async (campaignId, byCreator) => {  // if not byCreator then it is byAdmin(deployer)
        console.log("Stopped event:", {campaignId, byCreator});
        const stoppedCampaign = await crowdfundContract.campaigns(campaignId);
        const stoppedCampaignObj = {
          id: stoppedCampaign[0],
          creator: stoppedCampaign[1],
          metadataUrl: stoppedCampaign[2],
          goal: stoppedCampaign[3],
          deadline: stoppedCampaign[4],
          fundsRaised: stoppedCampaign[5],
          totalContributors: stoppedCampaign[6],
          isClosed: stoppedCampaign[7],
          isStopped: true,
        }

        // const isStopped = await crowdfundContract.isStopped(withdrawnCampaignObj.id);
        // withdrawnCampaignObj.isStopped = isStopped;

        const { totalActiveCampaigns, totalClosedCampaigns } = await getCampaignsCount();
        setTotalCampaigns(totalActiveCampaigns);
        setTotalClosedCampaigns(totalClosedCampaigns);

        setClosedCampaigns((prev) => {
          return [...prev, stoppedCampaignObj];
        });
        
        setCampaigns((prev) => {
          return prev.filter((el) => el.id !== campaignId);
        })
        setShowCampaignInfo(null); // closing the currently opened campaign because it will change group/list
      });

      crowdfundContract.on("Refunded", async (campaignId, backer, amount) => {
        console.log("Refunded event:", {campaignId, backer, amount});
        const refundingCampaign = await crowdfundContract.campaigns(campaignId);
        const refundingCampaignObj = {
          id: refundingCampaign[0],
          creator: refundingCampaign[1],
          metadataUrl: refundingCampaign[2],
          goal: refundingCampaign[3],
          deadline: refundingCampaign[4],
          fundsRaised: refundingCampaign[5],
          totalContributors: refundingCampaign[6],
          isClosed: refundingCampaign[7],
          isStopped: true,  // refundable campaigns are stopped
        }

        setClosedCampaigns((prev) => {
          const updatedCampaigns = [...prev];
          const campaignIndex = updatedCampaigns.findIndex((campaign) => campaign.id === campaignId);
          updatedCampaigns[campaignIndex] = refundingCampaignObj;
          return updatedCampaigns;
        });
      });
    }

    return () => {
      if (crowdfundContract) {
        try {
          crowdfundContract.off("CampaignCreated");
          crowdfundContract.off("Funded");
          crowdfundContract.off("Withdrawn");
          crowdfundContract.off("Stopped");
          crowdfundContract.off("Refunded");
        } catch (error) {
          console.error("Error removing event listener", error);
        }
      }
    };
  }, [crowdfundContract]);

  useEffect(() => {
    if (signer) {
      try {
        setAddress(signer.address);
      } catch (error) {
        console.error("Error getting signer address:", error);
      }
    } else {
      setAddress("");
    }
  }, [signer]);

  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = async (accounts) => {
        if (accounts.length === 0) {
          console.log("MetaMask is locked or the user has disconnected.");
          setSigner(null);
        } else {
          console.log("Account changed:", accounts[0]);
          // setAddress(accounts[0]);
          const newSigner = await provider.getSigner(accounts[0]);
          setSigner(newSigner);
        }
      }

      const handleChainChanged = (chainId) => {
        console.log("Chain changed to:", chainId);
        window.location.reload(); // Reload the page to handle the new chain
        // Is there need to reconnect accounts?
      }

      const handleDisconnect = (error) => {
        console.log("MetaMask disconnected:", error);
        setSigner(null);
      }

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);
      window.ethereum.on("disconnect", handleDisconnect);  //  This only happens due to network connectivity issues or some unforeseen error.

      return () => {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
        window.ethereum.removeListener("disconnect", handleDisconnect);
      };
    } else {
      console.log("MetaMask is not installed.");
    }
  }, [provider]);

  return (
    <div>
      <NavBar  ref={campaignInfoRef}
        crowdfundContract={crowdfundContract}
        walletDetected={walletDetected}
        address={address}
        contractAddress={contractAddress.Crowdfund}
        provider={provider}
        signer={signer}
        setSigner={setSigner}
        networkId={HARDHAT_NETWORK_ID}
        setWalletError={setWalletError}
        showForm={showForm}
        setShowForm={setShowForm}
        loadingNewCampaign={loadingNewCampaign}
        showCampaignInfo={showCampaignInfo}
        setShowCampaignInfo={setShowCampaignInfo}
      />
      { !walletDetected && <NoWalletDetected /> }
      { walletError && <ErrorMessage message={walletError.message} setErrorMessage={setWalletError}/> }
      { initError && <ErrorMessage message={initError.message} setErrorMessage={setInitError}/> }
      {
        showForm && (
          <NewCampaignForm
            crowdfundContract={crowdfundContract}
            provider={provider}
            signer={signer}
            setSigner={setSigner}
            loadingNewCampaign={loadingNewCampaign}
            setLoadingNewCampaign={setLoadingNewCampaign}
          />
        )
      }
      {
        showCampaignInfo && (
          <CampaignInfoCard
            campaign= {showCampaignInfo.isClosed ? 
              {metadata: showCampaignInfo.metadata, ...closedCampaigns[closedCampaigns.findIndex((obj) => obj.id === showCampaignInfo.id)]} :
              {metadata: showCampaignInfo.metadata, ...campaigns[campaigns.findIndex((obj) => obj.id === showCampaignInfo.id)]}
            }
            crowdfundContract={crowdfundContract}
            signer={signer}
            setSigner={setSigner}
            provider={provider}
          />
        )
      }
      <section>
        <h2 className="active-campaigns-h2">Active Campaigns ({totalActiveCampaigns})</h2>
        <ul className="active-campaigns-container">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Card
                id={campaign.id}
                creator={campaign.creator}
                metadataUrl={campaign.metadataUrl}
                goal={campaign.goal} deadline={campaign.deadline}
                fundsRaised={campaign.fundsRaised}
                isClosed={campaign.isClosed}
                isStopped={campaign.isStopped}
                setShowCampaignInfo={setShowCampaignInfo}
                scrollToCampaignInfo={scrollToCampaignInfo}
              />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="active-campaigns-h2">Closed Campaigns ({totalClosedCampaigns})</h2>
        <ul className="active-campaigns-container">
          {closedCampaigns.map((campaign) => (
            <li key={campaign.id}>
              <Card
                id={campaign.id}
                creator={campaign.creator}
                metadataUrl={campaign.metadataUrl}
                goal={campaign.goal} deadline={campaign.deadline}
                fundsRaised={campaign.fundsRaised}
                isClosed={campaign.isClosed}
                isStopped={campaign.isStopped}
                setShowCampaignInfo={setShowCampaignInfo}
                scrollToCampaignInfo={scrollToCampaignInfo}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default App
