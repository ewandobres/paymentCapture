// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
import * as google from "firebase-admin";
import QueryDocumentSnapshot = google.firestore.QueryDocumentSnapshot;
import {EventContext} from "firebase-functions";

const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database.
const admin = require('firebase-admin');
admin.initializeApp();

import SquareConnect = require('square-connect');
const {
    PaymentsApi
} = require('square-connect');
const defaultClient = SquareConnect.ApiClient.instance;

const oauth2 = defaultClient.authentications['oauth2'];
oauth2.accessToken = "EAAAEGHqnSltURHr2q_mAb_beZoBIc3iyteekRCAFWU7PfDh0Qz1mqV-HL-nJl32";

defaultClient.basePath = "https://connect.squareupsandbox.com";

const paymentsApi = new PaymentsApi(defaultClient);
// Listen for changes in all documents in the 'users' collection
exports.paymentCapture = functions.region('europe-west2').firestore
    .document('Shops/{shopId}/PastTransactions/{paymentId}')
    .onCreate((change:QueryDocumentSnapshot, context:EventContext) => {
        const newValue = change.data();
        const shopId = context.params.shopId;
        const paymentId = context.params.paymentId;

        if (newValue.charge !== undefined) {
            console.log("already processed")
            return "Payment Already Processed";
        }

        async function capturePayment(){
            const body = new SquareConnect.CompletePaymentRequest();

            const response = await paymentsApi.completePayment(newValue.payment.id, body)

            await captureResponseToFirestore(response);

            return true;
        }

        async function captureResponseToFirestore(captureResponse: any) {

            await admin.firestore()
                .doc(`/Shops/${shopId}/PastTransactions/${paymentId}`)
                .set(JSON.parse(JSON.stringify(captureResponse)), {merge: true});

            await totalPayments()
        }

        async function totalPayments() {

            const snapshot = await admin.firestore().doc(`/Shops/${shopId}`).get()

            if (snapshot.exists) {
                const paymentBalance : number = snapshot.data().paymentBalance
                let newPaymentBalance : number

                if (paymentBalance !== null) {
                    newPaymentBalance = paymentBalance + parseFloat(newValue.amount)
                } else {
                    newPaymentBalance = parseFloat(newValue.amount)
                }

                await admin.firestore().doc(`/Shops/${shopId}`).update({"paymentBalance": newPaymentBalance})
            } else {
                console.error("Shop file not found whilst attempting balance update shopId: " + shopId)
            }

        }

        return capturePayment();

    });