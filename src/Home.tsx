import React, { useEffect, useState } from "react";
import styled from "styled-components";
import Countdown from "react-countdown";
import { Button, CircularProgress, Snackbar } from "@material-ui/core";
import { useNavigate } from "react-router-dom";
import Alert from "@material-ui/lab/Alert";
import './home.css';

import {Route, Link} from 'react-router-dom'
import HoverRugz from './HoverRugz'

import * as anchor from "@project-serum/anchor";

import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TokenAccountsFilter } from "@solana/web3.js";
import * as web3js from "@solana/web3.js";
import axios from "axios";
import { getParsedNftAccountsByOwner,isValidSolanaAddress, createConnectionConfig,} from "@nfteyez/sol-rayz";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletDialogButton } from "@solana/wallet-adapter-material-ui";

import Typewriter from "typewriter-effect";

import {
  CandyMachine,
  awaitTransactionSignatureConfirmation,
  getCandyMachineState,
  mintOneToken,
  shortenAddress,
} from "./candy-machine";
import { Filter, NoEncryption } from "@material-ui/icons";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const ConnectButton = styled(WalletDialogButton)``;

const CounterText = styled.span``; // add your styles here

const MintContainer = styled.div``; // add your styles here

const MintButton = styled(Button)``; // add your styles here

export interface HomeProps {
  candyMachineId: anchor.web3.PublicKey;
  config: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  startDate: number;
  treasury: anchor.web3.PublicKey;
  txTimeout: number;
}

const Home = (props: HomeProps) => {
  const [balance, setBalance] = useState<number>();
  const [isActive, setIsActive] = useState(false); // true when countdown completes
  const [isSoldOut, setIsSoldOut] = useState(false); // true when items remaining is zero
  const [isMinting, setIsMinting] = useState(false); // true when user got to press MINT

  const [itemsAvailable, setItemsAvailable] = useState(0);
  const [itemsRedeemed, setItemsRedeemed] = useState(0);
  const [itemsRemaining, setItemsRemaining] = useState(0);

  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });
  
  let mintedItems : any[] | undefined = undefined;
  const [hasThugRug, setHasThugRug] = useState<Boolean>();

  const [startDate, setStartDate] = useState(new Date(props.startDate));

  const wallet = useAnchorWallet();
  const [candyMachine, setCandyMachine] = useState<CandyMachine>();

  const refreshCandyMachineState = () => {
    (async () => {
      if (!wallet) return;

      const {
        candyMachine,
        goLiveDate,
        itemsAvailable,
        itemsRemaining,
        itemsRedeemed,
      } = await getCandyMachineState(
        wallet as anchor.Wallet,
        props.candyMachineId,
        props.connection
      );

      setItemsAvailable(itemsAvailable);
      setItemsRemaining(itemsRemaining);
      setItemsRedeemed(itemsRedeemed);

      setIsSoldOut(itemsRemaining === 0);
      setStartDate(goLiveDate);
      setCandyMachine(candyMachine);

      mintedItems = await getNftTokenData().then(res => (mintedItems = res));

    })();
  };

  const onMint = async () => {
    try {
      setIsMinting(true);
      if (wallet && candyMachine?.program) {
        const mintTxId = await mintOneToken(
          candyMachine,
          props.config,
          wallet.publicKey,
          props.treasury
        );

        const status = await awaitTransactionSignatureConfirmation(
          mintTxId,
          props.txTimeout,
          props.connection,
          "singleGossip",
          false
        );

        if (!status?.err) {
          setAlertState({
            open: true,
            message: "Congratulations! Mint succeeded!",
            severity: "success",
          });
        } else {
          setAlertState({
            open: true,
            message: "Mint failed! Please try again!",
            severity: "error",
          });
        }
      }
    } catch (error: any) {
      // TODO: blech:
      console.log(error);
      let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (error.message.indexOf("0x138")) {
        } else if (error.message.indexOf("0x137")) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf("0x135")) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
          setIsSoldOut(true);
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: "error",
      });
    } finally {
      if (wallet) {
        const balance = await props.connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
      setIsMinting(false);
      refreshCandyMachineState();
    }
  };

  const getAllNftData = async () => {
    try {
      if(wallet){
        let ownerToken = wallet.publicKey;
        const nfts = await getParsedNftAccountsByOwner({
          publicAddress: ownerToken,
          connection: props.connection
        });
        return nfts;
      }
    } catch (error) {
      console.log(error);
    }
  };
  
//Function to get all nft data
const getNftTokenData = async () => {
  try {
      let nftData = await getAllNftData();
      let nftArray = []
      if(nftData){
        for(var x=0; x<nftData.length; x++){
          nftArray.push({name: nftData[x].data.name, uri: nftData[x].data.uri})
        }
      }
      return nftArray;
  } catch (error) {
    console.log(error);
  }
};

const hasThugRugNFT = () => {
  if(mintedItems !== undefined){
    for(var i=0; i < mintedItems.length; i++){
      console.log(mintedItems[i].name);
      if(mintedItems[i].name.includes("Thug Rugz")){
        setHasThugRug(true);
        console.log('has thugrug')
      }
    }
  }
}

let navigate = useNavigate(); 
const routeChange = () =>{ 
  let path = '/HoverRugz'; 
  navigate(path);
}

  useEffect(() => {
    (async () => {
      if (wallet) {
        const balance = await props.connection.getBalance(wallet.publicKey);

        await getNftTokenData().then(res => (mintedItems = res));
        setBalance(balance / LAMPORTS_PER_SOL);
        hasThugRugNFT();
      }
    })();
  }, [wallet, props.connection]);

  useEffect(refreshCandyMachineState, [
    wallet,
    props.candyMachineId,
    props.connection,
  ]);

// <Button style={searchButtonStyle} onClick={routeChange}>Search Now</Button>

  return (
    <main>
      
      {/* {wallet && <p>Balance: {(balance || 0).toLocaleString()} SOL</p>} */}
      <div className="city">
      {<div id="gif" className="video">
        <video loop src="gif.mov"width="65%" autoPlay></video>
      </div>}
      <div className="mintContainer">
      {wallet && (
        <p>Wallet: {(wallet.publicKey.toBase58() || "")}</p>
      )} 
      
      {wallet && <p>Total Available: {itemsAvailable}</p>}

      {wallet && <p>Redeemed: {itemsRedeemed}</p>}

      {wallet &&<p>Remaining: {itemsRemaining}</p>}     

      </div>
      
      <MintContainer>
        {!wallet ? (
           <div className="connectButton"><ConnectButton id="button">Connect Wallet</ConnectButton></div>
        ) : (
          <div id="mint">
            <MintButton style={{paddingLeft: "1.5%", marginBottom:"1%"}} id="mintButton"
            disabled={isSoldOut || isMinting || !isActive}
            onClick={onMint}
            variant="contained"
          >

            {isSoldOut ? (
              "SOLD OUT"
            ) : isActive ? (
              isMinting ? (
                <CircularProgress />
              ) : (
                "MINT"
              )
            ) : (
              <Countdown
                date={startDate}
                onMount={({ completed }) => completed && setIsActive(true)}
                onComplete={() => setIsActive(true)}
                renderer={renderCounter}
              />
            )}
          </MintButton>
          {hasThugRug && <Link style={{backgroundColor: "#E0E0E0", marginLeft: "46.2%", color: "black", textDecoration: "none", padding: "12px", borderRadius: "5%", fontSize: "0.9em"}} to="/HoverRugz" state={{hasThugRug: hasThugRug}}>PLAY HOVERRUGZ</Link>}
          </div>
        )}
      </MintContainer>

      <Snackbar
        open={alertState.open}
        autoHideDuration={6000}
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
</div>
      
<div className="videoContainer">
  <video id="commercial" src="commercial.mov" width="75%" controls></video> 
</div>

      {<div id="about"><div className="aboutContainer">
        <h1 className="h1">ABOUT</h1>
        <p>Rugz that are thugs... 
        </p><p>A collection of 3,333 uniquely generated collectible ThugRugz available for minting on the Solana blockchain.  
        </p><p>Other than just being a development team, we here at THUGRUGZ treasure the Solana ecosystem because we were traders before we were investors on this project. Solana changed my life, and seeing this downtrend in the ecosystem is so heartbreaking. This is because people just keep shitposting projects, and we aim to change EVERYTHING with this project.
        </p><p>How? Let me explain. When you mint a THUGRUG, not only are you getting a badass NFT, but you're also getting a lottery ticket to be entered in a drawing for .1-5 SOL! YES! Many of you will randomly receive small to large amounts of SOL just for minting. This is the first way we intend to give back to the community. We also plan on airdropping random holders NFTs.
	      </p><p>You will also be entered in a draw for a TESLA and we are planning various merch drops..
	      </p><p>Just know the dev team is comprised of hardworking people who LOVE nfts and hope to bring excitement and life back into the Solana ecosystem. That’s the best thing any REAL project can do for a community.</p>
        </div></div>}

        {<div className="featuredRugz">
          <h1 className="h1" id="featuredRugTitle"> 
          <Typewriter
              options={{loop:true}}
              onInit={(typewriter)=> {
              typewriter
              .typeString("FEATURED 1 OF 1 RUGZ")
              .pauseFor(1000)
              .start();
          }}/></h1>

          <div className="row">
            <div className="firstCol column">
              <div className="grow"><img src="towelie.png"></img></div>
              <div className="grow"><img src="spidey.png"></img></div>
            </div>
            <div className="column">
              <div className="grow"><img src="flyysoulja.png"></img></div>
              <div className="grow"><img src="kodiyakredd.png"></img></div>
            </div>
            <div className="column">
              <div className="grow"><img src="squidgames.png"></img></div>
              <div className="grow"><img src="jigsaw.png"></img></div>
            </div>
          </div>
        </div>}

      {<div id="roadMapBg"><div id="roadmap" className="roadMapContainer"><h1 className="h1">ROADMAP</h1><h3>PHASE 1</h3><ul><li>THUG RUGZ GO LIVE: LAUNCH 3,333 RUGZ</li><ul><li>NO MAX PER WALLET</li><li>MINTERS WILL BE RANDOMLY SELECTED TO RECEIVE .1 - 5 SOL</li><li>HOVERRUGZ MINIGAME(ONLY AVAILABLE TO HOLDERS)</li></ul></ul><h3>PHASE 2</h3><ul><li>TESLA MODEL 3 GIVEAWAY</li><li>ROLEX GIVEAWAY</li><li>HOVERRUGZ GOES P2E WITH CUSTOMIZATION</li></ul><h3>PHASE 3</h3><ul><li>NFT AIRDROPS TO RANDOM HOLDERS</li><li>50 LUCKY HOLDERS WILL BE CHOSEN TO RECEIVE 1 SOL</li></ul><h3>PHASE 4</h3><ul><li>6.9% OF MINTING PROCEEDS WILL GO TO ST. JUDE CHILDREN'S HOSPITAL</li></ul><h3>PHASE 5</h3><ul><li>$RGZ TOKEN DEVELOPMENT</li><li>OUR FINAL GOAL IS TO RANDOMLY SELECT 1 LUCKY HOLDER A WEEK THIS PERSON WILL HAVE THEIR RUG SPECIALLY CRAFTED FOR THEM. WE WILL DO THIS OVER THE COURSE OF A YEAR OR UNTIL 52 RUGZ ARE MAILED OUT.</li></ul><h3>THUG RUGZ PART 2 COMING IN 2022</h3></div></div>}
      <div id="rarity" className="rarityContainer">
        <h1 className="h1"> 
          <Typewriter
              options={{loop:true}}
              onInit={(typewriter)=> {
              typewriter
              .typeString("RARITY")
              .pauseFor(1000)
              .start();
          }}/></h1>
          <div className="LayersRarity">
            <h3>Layers</h3>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Default.png"></img></div>
                <p className="smallerText">Default: Background, Rug, Mouth, Eyes</p>
                <p>750:3329</p>
                <div className="progressRed">
                  <div className="red"></div>
                </div>
                <div className="growRarity"><img src="rarity/Chain+MouthAcc+Hat.png"></img></div>
                <p>Chain, Mouth Accessory, Hat</p>
                <p>400:3329</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img src="rarity/Chain.png"></img></div>
                <p>Chain</p>
                <p>600:3329</p>
                <div className="progressRed">
                  <div className="red"></div>
                </div>
                <div className="growRarity"><img src="rarity/Chain+MouthAcc+Ear+Hat.png"></img></div>
                <p>Chain, Mouth Accessory, Earrings, Hat</p>
                <p>350:3329</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img src="rarity/Chain+MouthAcc.png"></img></div>
                <p>Chain, Mouth Accessory</p>
                <p>500:3329</p>
                <div className="progressRed">
                  <div className="red"></div>
                </div>
                <div className="growRarity"><img src="rarity/Chain+MouthAcc+Ear+Pattern.png"></img></div>
                <p className="smallerText"> Chain, Mouth Accessory, Earrings, Hat, Pattern</p>
                <p>279:3329</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img src="rarity/Chain+MouthAcc+Ear.png"></img></div>
                <p>Chain, Mouth Accessory, Earrings</p>
                <p>400:3329</p>
                <div className="progressRed">
                  <div className="red"></div>
                </div>
                <div className="growRarity"><img src="rarity/Zaza.png"></img></div>
                <p>Rug Color: Zaza</p>
                <p>42:3329</p>
                <div className="progressGreen">
                  <div className="green"></div>
                </div>
              </div>
            </div>


            <h3>Background</h3>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Backgrounds/Black.png"></img></div>
                <p>Black</p>
                <p>10%</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
                <div className="growRarity"><img src="rarity/Backgrounds/Purple.png"></img></div>
                <p>Purple</p>
                <p>10%</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img src="rarity/Backgrounds/Green.png"></img></div>
                <p>Green</p>
                <p>10%</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
                <div className="growRarity"><img src="rarity/Backgrounds/Teal.png"></img></div>
                <p>Teal</p>
                <p>8%</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img src="rarity/Backgrounds/Yellow.png"></img></div>
                <p>Yellow</p>
                <p>10%</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
                <div className="growRarity"><img src="rarity/Backgrounds/GreenYellow.png"></img></div>
                <p className="smallerText">GreenYellow</p>
                <p>8%</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Backgrounds/Brown.png"></img></div>
                <p>Brown</p>
                <p>10%</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
                <div className="growRarity"><img src="rarity/Backgrounds/HeavenlyClouds.png"></img></div>
                <p>HeavenlyClouds</p>
                <p>8%</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
              </div>
            </div>
            {/* new row */}
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Backgrounds/GreenBlue.png"></img></div>
                <p>GreenBlue</p>
                <p>7%</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img src="rarity/Backgrounds/RedOrange.png"></img></div>
                <p>RedOrange</p>
                <p>7%</p>
                <div className="progressYellow">
                  <div className="yellow"></div>
                </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img src="rarity/Backgrounds/Chiraq.png"></img></div>
                <p>Chiraq</p>
                <p>5%</p>
                <div className="progressGreen">
                  <div className="green"></div>
                </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img src="rarity/Backgrounds/SouthBeach.png"></img></div>
                <p>SouthBeach</p>
                <p>5%</p>
                <div className="progressGreen">
                  <div className="green"></div>
                </div>
              </div>
            </div>
            
           {/* new row */}   
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Backgrounds/Solana.png"></img></div>
                  <p>Solana</p>
                  <p>2%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img></img></div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img></img></div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img></img></div>
              </div>
            </div>
            

            <h3>Rug</h3>  
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Rug/White.png"></img></div>
                  <p>White</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Black.png"></img></div>
                  <p>Black</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Blue.png"></img></div>
                  <p>Blue</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Red.png"></img></div>
                  <p>Red</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Rug/Gold.png"></img></div>
                  <p>Gold</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Green.png"></img></div>
                  <p>Green</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Brown.png"></img></div>
                  <p>Brown</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Lava.png"></img></div>
                  <p>Lava</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Rug/Ice.png"></img></div>
                <p>Ice</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
                </div>
                <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Alien.png"></img></div>
                  <p>Alien</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Zombie.png"></img></div>
                  <p>Zombie</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Trippy.png"></img></div>
                  <p>Trippy</p>
                  <p>4%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
              </div>
              
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Rug/Aquarock.png"></img></div>
                  <p>AquaRock</p>
                  <p>3%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
                </div>
                <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Rugpool.png"></img></div>
                  <p>Rugpool</p>
                  <p>2%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Rug/Solana.png"></img></div>
                  <p>Solana</p>
                  <p>1%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img></img></div>
              </div>
            </div>

            <h3>Eyes</h3>  
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Eyes/NormalEyes.png"></img></div>
                  <p>Normal Eyes</p>
                  <p>20%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Eyes/LaserEyes.png"></img></div>
                  <p>Lazer Eyes</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Eyes/HypnotizeEyez.png"></img></div>
                  <p>Hypnotize Eyez</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Eyes/BlackGlasses.png"></img></div>
                  <p>Black Glasses</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Eyes/GoldGlasses.png"></img></div>
                  <p>Gold Glasses</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Eyes/CrackedOutEyes.png"></img></div>
                  <p>Cracked Out Eyes</p>
                  <p>8%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Eyes/StonedEyes.png"></img></div>
                  <p>StonedEyes</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Eyes/SilverGlasses.png"></img></div>
                  <p>Silver Glasses</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Eyes/GoldVipers.png"></img></div>
                <p>Gold Vipers</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
                </div>
                <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Eyes/WhiteVipers.png"></img></div>
                  <p>White Vipers</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Eyes/VRHeadset.png"></img></div>
                  <p>VR Headset</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Eyes/SolanaGlasses.png"></img></div>
                  <p>Solana Glasses</p>
                  <p>3%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
              </div>
              
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Eyes/SolanaVipers.png"></img></div>
                  <p>Solana Vipers</p>
                  <p>2%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
                </div>
                <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Eyes/SolanaVRHeadset.png"></img></div>
                  <p>Solana VR Headset</p>
                  <p>2%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img></img></div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img></img></div>
              </div>
            </div>

            <h3>Mouth</h3>  
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Mouth/Grumpy.png"></img></div>
                  <p>Grumpy</p>
                  <p>20%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Mouth/NormalLips.png"></img></div>
                  <p>Normal Lips</p>
                  <p>20%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Mouth/WhiteTeeth.png"></img></div>
                  <p>White Teeth</p>
                  <p>15%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Mouth/Donkey.png"></img></div>
                  <p>Donkey</p>
                  <p>15%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Mouth/DiamondGrillz.png"></img></div>
                  <p>Diamond Grillz</p>
                  <p>10%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Mouth/FloridaTeeth.png"></img></div>
                  <p>FloridaTeeth</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Mouth/KylieLips.png"></img></div>
                  <p>Kylie Lips</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Mouth/HerpesLips.png"></img></div>
                  <p>Herpes Lips</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Mouth/Shark.png"></img></div>
                <p>Shark</p>
                  <p>3%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
                </div>
                <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Mouth/Ratashi69.png"></img></div>
                  <p>Ratashi69</p>
                  <p>2%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img></img></div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img></img></div>
              </div>
              
            </div>

            <h3>Chain</h3>  
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Chain/IcedChain.png"></img></div>
                  <p>IcedChain</p>
                  <p>45%</p>
                  <div className="progressRed">
                    <div className="red50"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Chain/GoldChain.png"></img></div>
                  <p>Gold Chain</p>
                  <p>40%</p>
                  <div className="progressRed">
                    <div className="red50"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Chain/JesusPiece.png"></img></div>
                  <p>Jesus Piece</p>
                  <p>10%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Chain/Floatie.png"></img></div>
                  <p>Floatie</p>
                  <p>5%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
              </div>
            </div>
            
            <h3>Mouth Accessory</h3>  
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/MouthAccessory/Blunt.png"></img></div>
                  <p>Blunt</p>
                  <p>50%</p>
                  <div className="progressRed">
                    <div className="red50"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/MouthAccessory/Joint.png"></img></div>
                  <p>Joint</p>
                  <p>50%</p>
                  <div className="progressRed">
                    <div className="red50"></div>
                  </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img ></img></div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img ></img></div>
              </div>
            </div>

            <h3>Earrings</h3>  
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Earrings/GoldEarrings.png"></img></div>
                  <p>Gold Earrings</p>
                  <p>50%</p>
                  <div className="progressRed">
                    <div className="red50"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Earrings/SilverEarrings.png"></img></div>
                  <p>Silver Earrings</p>
                  <p>50%</p>
                  <div className="progressRed">
                    <div className="red50"></div>
                  </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img ></img></div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img ></img></div>
              </div>
            </div>

            <h3>Pattern</h3>  
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Pattern/Thugberry.png"></img></div>
                  <p>Thugberry</p>
                  <p>50%</p>
                  <div className="progressRed">
                    <div className="red50"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Pattern/Balencirugga.png"></img></div>
                  <p>Balencirugga</p>
                  <p>50%</p>
                  <div className="progressRed">
                    <div className="red50"></div>
                  </div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img ></img></div>
              </div>
              <div className="columnRarity">
                <div className="growRarity"><img ></img></div>
              </div>
            </div>

            <h3>Hat</h3>  
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Hat/BlackBeanie.png"></img></div>
                  <p>Black Beanie</p>
                  <p>15%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
                </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Hat/TealBeanie.png"></img></div>
                  <p>Teal Beanie</p>
                  <p>15%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Hat/GreenBeanie.png"></img></div>
                <p>Green Beanie</p>
                  <p>15%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Hat/BlackDurag.png"></img></div>
                  <p>Black Durag</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
              </div>
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
                <div className="growRarity"><img src="rarity/Hat/GreenDurag.png"></img></div>
                  <p>Green Durag</p>
                  <p>10%</p>
                  <div className="progressRed">
                    <div className="red"></div>
                  </div>
                </div>
              <div className="columnRarity">
                <div className="growRarity"><img src="rarity/Hat/BlueDurag.png"></img></div>
                    <p>Blue Durag</p>
                    <p>10%</p>
                    <div className="progressRed">
                      <div className="red"></div>
                    </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Hat/RedDurag.png"></img></div>
                  <p>Red Durag</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Hat/PurpleDurag.png"></img></div>
                  <p>Purple Durag</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
              <div className="growRarity"><img src="rarity/Hat/PurpleCap.png"></img></div>
                  <p>Purple Cap</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
                </div>
                <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Hat/Crown.png"></img></div>
                  <p>Crown</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Hat/DevilHorns.png"></img></div>
                  <p>Devil Horns</p>
                  <p>5%</p>
                  <div className="progressYellow">
                    <div className="yellow"></div>
                  </div>
              </div>
              <div className="columnRarity">
              <div className="growRarity"><img src="rarity/Hat/SolanaDurag.png"></img></div>
                  <p>Solana Durag</p>
                  <p>3%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
              </div>
              
            </div>
            <div className="rowRarity">
              <div className="firstColRarity columnRarity">
              <div className="growRarity"><img src="rarity/Hat/FlamingHead.png"></img></div>
                  <p>Flaming Head</p>
                  <p>2%</p>
                  <div className="progressGreen">
                    <div className="green"></div>
                  </div>
                </div>
                <div className="columnRarity">
                  <div className="growRarity"><img></img></div>
                </div>
                <div className="columnRarity">
                  <div className="growRarity"><img></img></div>
                </div>
                <div className="columnRarity">
                  <div className="growRarity"><img></img></div>
                </div>
              </div>


          </div>
        </div>
        
    </main>
  );
};

interface AlertState {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error" | undefined;
}

const renderCounter = ({ days, hours, minutes, seconds, completed }: any) => {
  return (
    <CounterText>
      {hours + (days || 0) * 24} hours, {minutes} minutes, {seconds} seconds
    </CounterText>
  );
};

export default Home;
