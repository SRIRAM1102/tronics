import express, { response } from "express";
import bcrypt, { compare } from "bcrypt";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import jwt from "jsonwebtoken";
import Razorpay from "razorpay";
import nodemailer from "nodemailer";

const app = express();
app.use(express.json());
app.use(cors());
dotenv.config();

const PORT = process.env.PORT;
const MONGO_URL = process.env.MONGO_URL;
let instance=new Razorpay({
key_id:'rzp_test_A77m4MfWiF4Kpx',
key_secret:'03h3XLORq3qk88j8EQrKuGpr',
})

//Mongodb Connect
export async function createConnection() {
  const client = new MongoClient(MONGO_URL);
  return await client.connect();
}

//Hashing Password
async function genpassword(userPassword) {
  const salt = await bcrypt.genSalt(10);
  const haspassword = await bcrypt.hash(userPassword, salt);
  return haspassword;
}

//Search Mail
async function searchedMail(emailId) {
  const client = await createConnection();
  const result = await client
    .db("ecommerce")
    .collection("user")
    .findOne({ emailId: emailId });
  return result;
}

//Signup
app.post("/signup", async (req, res) => {
  const { userName, emailId, userPassword } = req.body;

  const value = await searchedMail(emailId);
  if (!value) {
    const hashedpassword = await genpassword(userPassword);
    const client = await createConnection();
    const result = await client.db("ecommerce").collection("user").insertOne({
      userName: userName,
      emailId: emailId,
      userPassword: hashedpassword,
      cartitem: [],
      buyitem: [],
    });
    res.send({ sucess: "user created" });
  } else {
    res.send({ msg: "existing mailid" });
  }
});

//login
app.post("/login", async (req, res) => {
  const { emailId, password } = req.body;
  const value = await searchedMail(emailId);

  if (value != null) {
    const passindb = value.userPassword;
    const passinlogin = password;
    const ispasstrue = await bcrypt.compare(passinlogin, passindb);

    if (ispasstrue) {
      const client = await createConnection();
      const value = await client
        .db("ecommerce")
        .collection("user")
        .findOne({ emailId: emailId });
      let token = jwt.sign({ id: value._id }, "uniquecode", {
        expiresIn: "2h",
      });
      res.send({
        token: token,
        id: value._id,
        cartitem: value.cartitem,
        buyitem: value.buyitem,
      });
    } else {
      res.send({ msg: "invalid login" });
    }
  } else {
    res.send({ msg: "wrong user" });
  }
});

//product database
app.get("/productdata", async (req, res) => {
  const client = await createConnection();
  const result = await client
    .db("ecommerce")
    .collection("products")
    .find({})
    .toArray();
  res.send(result);
});

//Place CartItems
app.post("/cartitems", async (req, res) => {
  const { userid, productname, amount,image,count } = req.body;

  const client = await createConnection();
  const result = await client
    .db("ecommerce")
    .collection("user")
    .updateOne(
      { _id: ObjectId(userid) },
      {
        $push: {
          cartitem: { productname: productname,  amount: amount,image:image,count:count },
        },
      }
    );

  const value = await client
    .db("ecommerce")
    .collection("user")
    .findOne({ _id: ObjectId(userid) });

  res.send(value.cartitem);
});

//orderid creation
app.post("/orderid", async (req, res) => {
  const {amount} = req.body;

  var options = {
    amount: amount*100, 
    currency: "INR",
    receipt: "order_rcptid_11"
  };
  instance.orders.create(options, function(err, order) {

    res.send({orderid:order.id})
  });

});

//Place Items
app.post("/buyitems", async (req, res) => {
  const { userid, productname,count, amount,image } = req.body;
  const client = await createConnection();
  const result = await client
    .db("ecommerce")
    .collection("user")
    .updateOne(
      { _id: ObjectId(userid) },
      {
        $push: {
          buyitem: { productname: productname, count: count, amount: amount,image:image },
        },
      }
    );
  const value = await client
    .db("ecommerce")
    .collection("user")
    .findOne({ _id: ObjectId(userid) });

  res.send(value.buyitem);
  //Mailer
  // var transporter = nodemailer.createTransport({
  //   service: "outlook",
  //   auth: {
  //     user: "sriramsaravanan11@outlook.com",
  //     pass: "Sriram4924",
  //   },
  // });

  // var mailOptions = {
  //   from: "sriramsaravanan11@outlook.com",
  //   to: emailId,
  //   subject: "Welcome message",
  //   text: "Colorcombinator welcomes you!!",
  // };

  // transporter.sendMail(mailOptions, function (error, info) {
  //   if (error) {
  //     console.log(error);
  //   } else {
  //     console.log("Email sent: " + info.response);
  //   }
  // });


});

app.post("/buyitems/sucess", async (req, res) => {
  try{
  const {orderCreationId,razorpayPaymentId,razorpayOrderId,razorpaySignature} = req.body;
      const shasum = crypto.createHmac("sha256", "w2lBtgmeuDUfnJVp43UpcaiT");
       shasum.update(`${orderCreationId}|${razorpayPaymentId}`,"secretman");
       const digest = shasum.digest("hex");
        if (digest !== razorpaySignature)
            return res.status(400).json({ msg: "Transaction not legit!" });
        res.send({
            msg: "success",
            orderId: razorpayOrderId,
            paymentId: razorpayPaymentId,
        });}
      catch (error) {
        res.status(500).send(error);
    }
});
//Buy From Cart
app.post("/buycartitems", async (req, res) => {
  const { userid, data } = req.body;

  const client = await createConnection();
  for (var i = 0; i < data.length; i++) {
    const result = await client
      .db("ecommerce")
      .collection("user")
      .updateOne({ _id: ObjectId(userid) }, { $push: { buyitem: data[i] } });
  }

  const variable = await client
    .db("ecommerce")
    .collection("user")
    .updateOne(
      { _id: ObjectId(userid) },
      { $set: { cartitem: [] } },
      { multi: true }
    );

  const value = await client
    .db("ecommerce")
    .collection("user")
    .findOne({ _id: ObjectId(userid) });

  res.send({ buyitem: value.buyitem, cartitem: value.cartitem });
});

//Remove From Cart
app.post("/removecart", async (req, res) => {
  const { userid, data } = req.body;

  const client = await createConnection();
  const result = await client
    .db("ecommerce")
    .collection("user")
    .updateOne(
      { _id: ObjectId(userid) },
      { $pull: { cartitem: { productname: data } } }
    );

  const value = await client
    .db("ecommerce")
    .collection("user")
    .findOne({ _id: ObjectId(userid) });
  res.send(value.cartitem);
});

app.listen(PORT, () => console.log("sev started"));
