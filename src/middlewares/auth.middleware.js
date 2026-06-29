import jwt from "jsonwebtoken";

const protect = (req, res, next) => {

    try{

        const token = req.headers.authorization?.split(" ") [1];

    if(!token){
        return res.status(401).json({ message: "Not authorized, no token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    next();

    } catch(error) {
        res.status(401).json({
            success: false,
            message: error.message
        })
    }
    

}

export default protect;