import { Router } from "express";

const publicRoutes = Router();

publicRoutes.use("/events",(req,res) =>{
    res.send({ok: true}).status(200);
});

publicRoutes.use("/shiprocket",(req,res) =>{
    try{

    }catch(err){
        console.log("Failed to handle shiprocket webhook call reason -->" + err.message);
        req.status(200).send({
            ok: true
        })
    }
})

export default publicRoutes;