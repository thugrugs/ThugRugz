import { useEffect, useLayoutEffect, useState } from "react";

import styled from "styled-components";
import Countdown from "react-countdown";
import { Button, CircularProgress, Snackbar } from "@material-ui/core";
import {Navigate} from 'react-router-dom';
import Alert from "@material-ui/lab/Alert";
import './HoverRugz.css';

import * as anchor from "@project-serum/anchor";

import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TokenAccountsFilter } from "@solana/web3.js";
import * as web3js from "@solana/web3.js";
import axios from "axios";
import { getParsedNftAccountsByOwner,isValidSolanaAddress, createConnectionConfig,} from "@nfteyez/sol-rayz";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletDialogButton } from "@solana/wallet-adapter-material-ui";

import Typewriter from "typewriter-effect";

import gameLogo from 'gameLogo.png';

import {
  CandyMachine,
  awaitTransactionSignatureConfirmation,
  getCandyMachineState,
  mintOneToken,
  shortenAddress,
} from "./candy-machine";
import { Filter } from "@material-ui/icons";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { off } from "process";

const ConnectButton = styled(WalletDialogButton)``;

const CounterText = styled.span``; // add your styles here

const MintContainer = styled.div``; // add your styles here

const MintButton = styled(Button)``; // add your styles here

export interface HoverRugzProps {
  candyMachineId: anchor.web3.PublicKey;
  config: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  startDate: number;
  treasury: anchor.web3.PublicKey;
  txTimeout: number;
}

const HoverRugz = (props: HoverRugzProps) => {
  const [balance, setBalance] = useState<number>();
  const [hasThugRug, setHasThugRug] = useState<Boolean>();
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

  const [startDate, setStartDate] = useState(new Date(props.startDate));

  const wallet = useAnchorWallet();
  const [candyMachine, setCandyMachine] = useState<CandyMachine>();

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
    var found = false;
    if(mintedItems !== undefined){
      for(var i=0; i < mintedItems.length; i++){
        console.log(mintedItems[i].name);
        if(mintedItems[i].name.includes("Thug Rugz")){
          found = true;
          setHasThugRug(true);
          console.log('has thugrug')
        }
      }
    }
    if(found == false){
      setHasThugRug(false);
    }
  }

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
    })();
  };

  var scoreCounter = 0;

  useLayoutEffect(() => {
    setHasThugRug(true);
  })

  useEffect(() => {
    getNftTokenData();
    hasThugRugNFT();

    (async () => {
      console.log('useeffect async')
      var start = document.getElementById("start");
      var logo = document.getElementById("gameLogo");
      var message = document.getElementById("message");
      var game = document.getElementById("game");
      var block = document.getElementById("block");
      var hole = document.getElementById("hole");
      var character = document.querySelector("#character");
      var jumping = 0;

      var startButton = document.getElementById("start");
      startButton?.addEventListener('click', () => {
        console.log('clicked')
        startGame();
      });
    
      function blockAnimations(){
        block?.addEventListener('animationiteration', setScore);
      }
    
      function setScore(){
        console.log('animation iteration' + scoreCounter)
        var random = ((Math.random()*50) + 40);
        block?.setAttribute("style", "bottom: -" + random + "%;")
        scoreCounter++;
      }

      function gravity(){
        const loop = setInterval(function(){
          var characterTop;
          //console.log(character)
          //console.log(block);
          if(character && block) {
    
            var blockLeft = parseInt(getComputedStyle(block).getPropertyValue("left"));
            var blockTop = parseInt(getComputedStyle(block).getPropertyValue("top"));
            characterTop = parseInt(getComputedStyle(character).getPropertyValue("top"));
            character?.setAttribute("style", "top:" + (characterTop + 4) + "px" )
            var cBottom = characterTop + 160 ;
            // console.log('blockleft: ' + blockLeft)
            // console.log(characterTop);
            // console.log(cBottom);
            // console.log(blockTop);        
    
            var characterLocation = window.screen.availWidth * .2;
            if( (characterTop > 1000) || ((blockLeft<=characterLocation) && (cBottom>=blockTop+160)) ){
              //stop gravity
              clearInterval(loop);

              block?.removeEventListener('animationiteration', setScore);

              //message and Restart button
              message?.setAttribute("style", "display:block;")
              if(message){
                message.textContent = "Game Over. Score: " + scoreCounter;
              }
              //message?.setAttribute("style", "margin-top: 10px;")
    
              start?.setAttribute("style", "display:block;")
              if(start){
                start.textContent = "Restart";
              }
              start?.setAttribute("style", "margin-top: 10%;")
              
    
              //reset character
              character?.setAttribute("style", "top:40%;" )
              //character?.setAttribute("style", "opacity:50%;" )
    
              //stop block
              //block?.setAttribute("style", "opacity:50%;" )
    

              //reset score
              scoreCounter = 0;

            }
        }
        }, 30);
      }
    
      function jump(){
        jumping = 1;
        var jumpCount = 0;
    
        var jumpInterval = setInterval(function() {
            
          var characterTop;
          if(character) {
            characterTop = parseInt(getComputedStyle(character).getPropertyValue("top"));
            if(characterTop > 6 && jumpCount<15){        
              character?.setAttribute("style", "top:" + (characterTop - 2) + "px" )
            }
          }
    
          if(jumpCount>20){
            clearInterval(jumpInterval);
            jumping = 0;
            jumpCount = 0;
          }
          jumpCount++;
        }, 10);
    
      }
    
      // game?.addEventListener('click', () => {
      //   jump();
      // });
    
    function startGame() {
        scoreCounter = 0;
        start?.setAttribute("style", "display:none;")
        console.log('start');
    
        //message and Restart button
        if(message){
          message.textContent = "";
        }
        logo?.setAttribute("style", "display:none;");
    
        blockAnimations();
        gravity();
    
        document.addEventListener('keydown', event => {
          if (event.code === 'Space') {
            jump();
          }
        });
    
        logo?.setAttribute("style", "display:none;")
      };

    })();
  }, [wallet, props.connection]);

  useEffect(refreshCandyMachineState, [
    wallet,
    props.candyMachineId,
    props.connection,
  ]);

  return (
    <main>
      
      {/* {wallet && <p>Balance: {(balance || 0).toLocaleString()} SOL</p>} */}
      { hasThugRug  &&
          <div id="game">
            <div id="gameLogo"></div>
            <div id="start">Start</div>
            <p id="message"></p>
            <div id="block"></div>
            <div id="hole"></div>
            <div id="character"></div>
          </div>
      }

        <script>
          
        blockAnimations();
        </script>
    </main>
  );
};

// <Navigate to='/' />

interface AlertState {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error" | undefined;
}

export default HoverRugz;
