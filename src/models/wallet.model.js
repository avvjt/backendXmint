import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },

        asset: {
            type: String,
            enum: ["USDT"],
            default: "USDT",
            required: true,
        },

        network: {
            type: String,
            enum: ["BEP20"],
            default: "BEP20",
            required: true,
        },

        depositAddress: {
            type: String,
            default: null,
            unique: true,
            sparse: true,
            trim: true,
        },

        availableBalance: {
            type: Number,
            default: 0,
            min: 0,
        },

        lockedBalance: {
            type: Number,
            default: 0,
            min: 0,
        },
        addressIndex: {
            type: Number,
            unique: true,
            sparse: true,
        },
    },
    {
        timestamps: true,
    }
);

const Wallet = mongoose.model("Wallet", walletSchema);

export default Wallet;