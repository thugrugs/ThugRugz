import { useCallback, useEffect, useMemo, useState } from 'react';
import * as anchor from '@project-serum/anchor';
import { BrowserRouter, Route, Link } from "react-router-dom";

import styled from 'styled-components';
import { Container, Snackbar } from '@material-ui/core';
import Paper from '@material-ui/core/Paper';
import Alert from '@material-ui/lab/Alert';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import Typewriter from "typewriter-effect";
import {
  Commitment,
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletDialogButton } from '@solana/wallet-adapter-material-ui';
import {
  awaitTransactionSignatureConfirmation,
  CANDY_MACHINE_PROGRAM,
  CandyMachineAccount,
  createAccountsForMint,
  getCandyMachineState,
  getCollectionPDA,
  mintOneToken,
  SetupState,
} from './candy-machine';
import { AlertState, formatNumber, getAtaForMint, toDate } from './utils';
import { MintButton } from './MintButton';
import { GatewayProvider } from '@civic/solana-gateway-react';
import { sendTransaction } from './connection';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import './home.css';

const ConnectButton = styled(WalletDialogButton)`
  width: 100%;
  height: 60px;
  margin-top: 10px;
  margin-bottom: 5px;
  background: linear-gradient(180deg, #604ae5 0%, #813eee 100%);
  color: white;
  font-size: 16px;
  font-weight: bold;
`;

const MintContainer = styled.div``; // add your owns styles here

export interface HomeProps {
  candyMachineId?: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  txTimeout: number;
  rpcHost: string;
  network: WalletAdapterNetwork;
}

const Home = (props: HomeProps) => {
  const [isUserMinting, setIsUserMinting] = useState(false);
  const [candyMachine, setCandyMachine] = useState<CandyMachineAccount>();
  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: '',
    severity: undefined,
  });
  const [isActive, setIsActive] = useState(false);
  const [endDate, setEndDate] = useState<Date>();
  const [itemsRemaining, setItemsRemaining] = useState<number>();
  const [isWhitelistUser, setIsWhitelistUser] = useState(false);
  const [isPresale, setIsPresale] = useState(false);
  const [isValidBalance, setIsValidBalance] = useState(false);
  const [discountPrice, setDiscountPrice] = useState<anchor.BN>();
  const [needTxnSplit, setNeedTxnSplit] = useState(true);
  const [setupTxn, setSetupTxn] = useState<SetupState>();

  const rpcUrl = props.rpcHost;
  const wallet = useWallet();

  const anchorWallet = useMemo(() => {
    if (
      !wallet ||
      !wallet.publicKey ||
      !wallet.signAllTransactions ||
      !wallet.signTransaction
    ) {
      return;
    }

    return {
      publicKey: wallet.publicKey,
      signAllTransactions: wallet.signAllTransactions,
      signTransaction: wallet.signTransaction,
    } as anchor.Wallet;
  }, [wallet]);

  const refreshCandyMachineState = useCallback(
    async (commitment: Commitment = 'confirmed') => {
      if (!anchorWallet) {
        return;
      }

      const connection = new Connection(props.rpcHost, commitment);

      if (props.candyMachineId) {
        console.log(props?.candyMachineId);
        try {
          const cndy = await getCandyMachineState(
            anchorWallet,
            props.candyMachineId,
            connection,
          );
          let active =
            cndy?.state.goLiveDate?.toNumber() < new Date().getTime() / 1000;
          let presale = false;

          // duplication of state to make sure we have the right values!
          let isWLUser = false;
          let userPrice = cndy.state.price;

          userPrice = isWLUser ? userPrice : cndy.state.price;

          if (cndy?.state.tokenMint) {
            // retrieves the SPL token
            const mint = new anchor.web3.PublicKey(cndy.state.tokenMint);
            const token = (
              await getAtaForMint(mint, anchorWallet.publicKey)
            )[0];
            try {
              const balance = await connection.getTokenAccountBalance(token);

              const valid = new anchor.BN(balance.value.amount).gte(userPrice);

              // only allow user to mint if token balance >  the user if the balance > 0
              setIsValidBalance(valid);
              active = active && valid;
            } catch (e) {
              setIsValidBalance(false);
              active = false;
              // no whitelist user, no mint
              console.log('There was a problem fetching SPL token balance');
              console.log(e);
            }
          } else {
            const balance = new anchor.BN(
              await connection.getBalance(anchorWallet.publicKey),
            );
            const valid = balance.gte(userPrice);
            setIsValidBalance(valid);
            active = active && valid;
          }

          if (cndy.state.isSoldOut) {
            active = false;
          }

          const [collectionPDA] = await getCollectionPDA(props.candyMachineId);
          const collectionPDAAccount = await connection.getAccountInfo(
            collectionPDA,
          );

          setIsActive((cndy.state.isActive = active));
          setIsPresale((cndy.state.isPresale = presale));
          setCandyMachine(cndy);

          const txnEstimate =
            892 +
            (!!collectionPDAAccount && cndy.state.retainAuthority ? 182 : 0) +
            (cndy.state.tokenMint ? 177 : 0) +
            (cndy.state.whitelistMintSettings ? 33 : 0) +
            (cndy.state.whitelistMintSettings?.mode?.burnEveryTime ? 145 : 0) +
            (cndy.state.gatekeeper ? 33 : 0) +
            (cndy.state.gatekeeper?.expireOnUse ? 66 : 0);

          setNeedTxnSplit(txnEstimate > 1230);
        } catch (e) {
          if (e instanceof Error) {
            if (
              e.message === `Account does not exist ${props.candyMachineId}`
            ) {
              setAlertState({
                open: true,
                message: `Couldn't fetch candy machine state from candy machine with address: ${props.candyMachineId}, using rpc: ${props.rpcHost}! You probably typed the REACT_APP_CANDY_MACHINE_ID value in wrong in your .env file, or you are using the wrong RPC!`,
                severity: 'error',
                hideDuration: null,
              });
            } else if (
              e.message.startsWith('failed to get info about account')
            ) {
              setAlertState({
                open: true,
                message: `Couldn't fetch candy machine state with rpc: ${props.rpcHost}! This probably means you have an issue with the REACT_APP_SOLANA_RPC_HOST value in your .env file, or you are not using a custom RPC!`,
                severity: 'error',
                hideDuration: null,
              });
            }
          } else {
            setAlertState({
              open: true,
              message: `${e}`,
              severity: 'error',
              hideDuration: null,
            });
          }
          console.log(e);
        }
      } else {
        setAlertState({
          open: true,
          message: `Your REACT_APP_CANDY_MACHINE_ID value in the .env file doesn't look right! Make sure you enter it in as plain base-58 address!`,
          severity: 'error',
          hideDuration: null,
        });
      }
    },
    [anchorWallet, props.candyMachineId, props.rpcHost],
  );

  const onMint = async (
    beforeTransactions: Transaction[] = [],
    afterTransactions: Transaction[] = [],
  ) => {
    try {
      setIsUserMinting(true);
      document.getElementById('#identity')?.click();
      if (wallet.connected && candyMachine?.program && wallet.publicKey) {
        let setupMint: SetupState | undefined;
        if (needTxnSplit && setupTxn === undefined) {
          setAlertState({
            open: true,
            message: 'Please sign account setup transaction',
            severity: 'info',
          });
          setupMint = await createAccountsForMint(
            candyMachine,
            wallet.publicKey,
          );
          let status: any = { err: true };
          if (setupMint.transaction) {
            status = await awaitTransactionSignatureConfirmation(
              setupMint.transaction,
              props.txTimeout,
              props.connection,
              true,
            );
          }
          if (status && !status.err) {
            setSetupTxn(setupMint);
            setAlertState({
              open: true,
              message:
                'Setup transaction succeeded! Please sign minting transaction',
              severity: 'info',
            });
          } else {
            setAlertState({
              open: true,
              message: 'Mint failed! Please try again!',
              severity: 'error',
            });
            setIsUserMinting(false);
            return;
          }
        } else {
          setAlertState({
            open: true,
            message: 'Please sign minting transaction',
            severity: 'info',
          });
        }

        let mintResult = await mintOneToken(
          candyMachine,
          wallet.publicKey,
          beforeTransactions,
          afterTransactions,
          setupMint ?? setupTxn,
        );

        let status: any = { err: true };
        let metadataStatus = null;
        if (mintResult) {
          status = await awaitTransactionSignatureConfirmation(
            mintResult.mintTxId,
            props.txTimeout,
            props.connection,
            true,
          );

          metadataStatus =
            await candyMachine.program.provider.connection.getAccountInfo(
              mintResult.metadataKey,
              'processed',
            );
          console.log('Metadata status: ', !!metadataStatus);
        }

        if (status && !status.err && metadataStatus) {
          // manual update since the refresh might not detect
          // the change immediately
          console.log('status')
          let remaining = itemsRemaining! - 1;
          console.log(remaining);
          setItemsRemaining(remaining);
          setIsActive((candyMachine.state.isActive = remaining > 0));
          candyMachine.state.isSoldOut = remaining === 0;
          setSetupTxn(undefined);
          setAlertState({
            open: true,
            message: 'Congratulations! Mint succeeded!',
            severity: 'success',
            hideDuration: 7000,
          });
          refreshCandyMachineState('processed');
        } else if (status && !status.err) {
          setAlertState({
            open: true,
            message:
              'Mint likely failed! Anti-bot SOL 0.01 fee potentially charged! Check the explorer to confirm the mint failed and if so, make sure you are eligible to mint before trying again.',
            severity: 'error',
            hideDuration: 8000,
          });
          refreshCandyMachineState();
        } else {
          setAlertState({
            open: true,
            message: 'Mint failed! Please try again!',
            severity: 'error',
          });
          refreshCandyMachineState();
        }
      }
    } catch (error: any) {
      let message = error.msg || 'Minting failed! Please try again!';
      if (!error.msg) {
        if (!error.message) {
          message = 'Transaction timeout! Please try again.';
        } else if (error.message.indexOf('0x137')) {
          console.log(error);
          message = `SOLD OUT!`;
        } else if (error.message.indexOf('0x135')) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          console.log(error);
          message = `SOLD OUT!`;
          window.location.reload();
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: 'error',
      });
      // updates the candy machine state to reflect the latest
      // information on chain
      refreshCandyMachineState();
    } finally {
      setIsUserMinting(false);
    }
  };

  useEffect(() => {
    refreshCandyMachineState();
    console.log('use efect');
    if(candyMachine) {
      console.log('candyMachine')
      console.log(candyMachine.state);
      setItemsRemaining(candyMachine.state.itemsRemaining);
      console.log(itemsRemaining);
  } 
  }, [
    anchorWallet,
    props.candyMachineId,
    props.connection,
    refreshCandyMachineState,
  ]);

  useEffect(() => {
    (function loop() {
      setTimeout(() => {
        refreshCandyMachineState();
        loop();
      }, 20000);
    })();
  }, [refreshCandyMachineState]);

  return (
    <main>
      
      {/* {wallet && <p>Balance: {(balance || 0).toLocaleString()} SOL</p>} */}
      <div className="city">
      {<div id="gif" className="video">
        <video loop src="gif.mov"width="65%" autoPlay></video>
      </div>}
      <div className="mintContainer">
        {anchorWallet && (
          <Typography variant="body2" color="textSecondary">
          Wallet: {(anchorWallet?.publicKey?.toBase58() || "")}
        </Typography>
        )} 
      
      <Container style={{ marginTop: 20 }}>
      <Container maxWidth="xs" style={{ position: 'relative' }}>
        <Paper
          style={{
            padding: 24,
            paddingBottom: 24,
            backgroundColor: '#151A1F',
            borderRadius: 6,
          }}
        >
          {!wallet.connected ? (
            <ConnectButton>Connect Wallet</ConnectButton>
          ) : (
            <>
              {candyMachine && (
                <Grid
                  container
                  direction="row"
                  justifyContent="center"
                  wrap="nowrap"
                >
                  <Grid item xs={3}>
                    <Typography variant="body2" color="textSecondary">
                      Remaining
                    </Typography>
                    <Typography
                      variant="h6"
                      color="textPrimary"
                      style={{
                        fontWeight: 'bold',
                      }}
                    >
                      {`${itemsRemaining}`}
                    </Typography>
                  </Grid>
                  <Grid item xs={4}>
                    <Typography variant="body2" color="textSecondary">
                      {isWhitelistUser && discountPrice
                        ? 'Discount Price'
                        : 'Price'}
                    </Typography>
                    <Typography
                      variant="h6"
                      color="textPrimary"
                      style={{ fontWeight: 'bold' }}
                    >
                      {isWhitelistUser && discountPrice
                        ? `◎ ${formatNumber.asNumber(discountPrice)}`
                        : `◎ ${formatNumber.asNumber(
                            candyMachine.state.price,
                          )}`}
                    </Typography>
                  </Grid>
                  <Grid item xs={5}>
                            <Typography
                              variant="caption"
                              align="center"
                              display="block"
                              style={{ fontWeight: 'bold' }}
                            >
                              MINT TBA
                            </Typography>
                  </Grid>
                </Grid>
              )}
              <MintContainer>
                {candyMachine?.state.isActive &&
                candyMachine?.state.gatekeeper &&
                wallet.publicKey &&
                wallet.signTransaction ? (
                  <GatewayProvider
                    wallet={{
                      publicKey:
                        wallet.publicKey ||
                        new PublicKey(CANDY_MACHINE_PROGRAM),
                      //@ts-ignore
                      signTransaction: wallet.signTransaction,
                    }}
                    gatekeeperNetwork={
                      candyMachine?.state?.gatekeeper?.gatekeeperNetwork
                    }
                    clusterUrl={
                      props.network === WalletAdapterNetwork.Devnet
                        ? 'https://api.devnet.solana.com'
                        : rpcUrl
                    }
                    handleTransaction={async (transaction: Transaction) => {
                      setIsUserMinting(true);
                      const userMustSign = transaction.signatures.find(sig =>
                        sig.publicKey.equals(wallet.publicKey!),
                      );
                      if (userMustSign) {
                        setAlertState({
                          open: true,
                          message: 'Please sign one-time Civic Pass issuance',
                          severity: 'info',
                        });
                        try {
                          transaction = await wallet.signTransaction!(
                            transaction,
                          );
                        } catch (e) {
                          setAlertState({
                            open: true,
                            message: 'User cancelled signing',
                            severity: 'error',
                          });
                          // setTimeout(() => window.location.reload(), 2000);
                          setIsUserMinting(false);
                          throw e;
                        }
                      } else {
                        setAlertState({
                          open: true,
                          message: 'Refreshing Civic Pass',
                          severity: 'info',
                        });
                      }
                      try {
                        await sendTransaction(
                          props.connection,
                          wallet,
                          transaction,
                          [],
                          true,
                          'confirmed',
                        );
                        setAlertState({
                          open: true,
                          message: 'Please sign minting',
                          severity: 'info',
                        });
                      } catch (e) {
                        setAlertState({
                          open: true,
                          message:
                            'Solana dropped the transaction, please try again',
                          severity: 'warning',
                        });
                        console.error(e);
                        // setTimeout(() => window.location.reload(), 2000);
                        setIsUserMinting(false);
                        throw e;
                      }
                      await onMint();
                    }}
                    broadcastTransaction={false}
                    options={{ autoShowModal: false }}
                  >
                    <MintButton
                      candyMachine={candyMachine}
                      isMinting={isUserMinting}
                      setIsMinting={val => setIsUserMinting(val)}
                      onMint={onMint}
                      isActive={
                        isActive ||
                        (isPresale && isWhitelistUser && isValidBalance)
                      }
                    />
                  </GatewayProvider>
                ) : (
                  <MintButton 
                    candyMachine={candyMachine}
                    isMinting={isUserMinting}
                    setIsMinting={val => setIsUserMinting(val)}
                    onMint={onMint}
                    isActive={
                      isActive ||
                      (isPresale && isWhitelistUser && isValidBalance)
                    }
                  />
                )}
              </MintContainer>
            </>
          )}
        </Paper>
      </Container>

      <Snackbar
        open={alertState.open}
        autoHideDuration={
          alertState.hideDuration === undefined ? 6000 : alertState.hideDuration
        }
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
    </Container>
        </div>

      </div>

      {<div id="about"><div className="aboutContainer">
        <h1 className="h1">ABOUT</h1>
        <p>Rugz that are thugs... 
        </p><p>A collection of 3,333 uniquely generated collectible ThugRugz available for minting on the Solana blockchain.  
        </p><p>Other than just being a development team, we here at THUGRUGZ treasure the Solana ecosystem because we were traders before we were investors on this project. Solana changed my life, and seeing this downtrend in the ecosystem is so heartbreaking. This is because people just keep shitposting projects, and we aim to change EVERYTHING with this project.
        </p><p>How? Let me explain. When you mint a THUGRUG, not only are you getting a badass NFT, but you're also getting an entry into our community. Many of you will randomly receive small to large amounts of SOL just for minting. This is the first way we intend to give back to the community. We also plan on airdropping random holders NFTs.
	      </p><p>You will also be entered in a draw for various merch drops and you can earn more entries by participating in the community.
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

      {<div id="roadMapBg"><div id="roadmap" className="roadMapContainer"><h1 className="h1">ROADMAP</h1><h3>PHASE 1</h3><ul><li>THUG RUGZ GO LIVE: LAUNCH 3,333 RUGZ</li><ul><li>NO MAX PER WALLET</li><li>MINTERS WILL BE RANDOMLY SELECTED TO RECEIVE SOL</li><li>HOVERRUGZ MINIGAME</li></ul></ul><h3>PHASE 2</h3><ul><li>HOVERRUGZ GOES P2E(SOL) WITH CUSTOMIZATION</li></ul><h3>PHASE 3</h3><ul><li>NFT AIRDROPS TO RANDOM HOLDERS</li></ul><h3>PHASE 4</h3><ul><li>OUR FINAL GOAL IS TO RANDOMLY SELECT A FEW HOLDERS TO HAVE THEIR RUG SPECIALLY CRAFTED FOR THEM.</li></ul><h3>THUG RUGZ PART 2..</h3></div></div>}
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

const getCountdownDate = (
  candyMachine: CandyMachineAccount,
): Date | undefined => {
  if (
    candyMachine.state.isActive &&
    candyMachine.state.endSettings?.endSettingType.date
  ) {
    return toDate(candyMachine.state.endSettings.number);
  }

  return toDate(
    candyMachine.state.goLiveDate
      ? candyMachine.state.goLiveDate
      : candyMachine.state.isPresale
      ? new anchor.BN(new Date().getTime() / 1000)
      : undefined,
  );
};

//export default Home;
