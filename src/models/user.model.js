import moongose from "mongoose"


const userSchema = new moongose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
        trim: true,
        lowercase: true
    },
    password:{
        type: String,
        minlength: 8
    },
    googleId: {
        type: String,
        default: null
    },
    provider: {
        type: String,
        enum:["local", "google"],
        default: "local"
    },
    // refferalCode: {
    //     type: String,
    //     unique: true,
    //     required: true
    // },
    resetPasswordToken: {
        type: String
    },
    resetPasswordExpire: {
        type: Date
    }

},{timestamps: true})

 const User = moongose.model('User', userSchema)


export default User 
