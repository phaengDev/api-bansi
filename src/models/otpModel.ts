import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "../config/database";
import { autoSync } from "../utils/autoSync";
// ✅ Attributes
interface OTPAttributes {
    _uuid: string;
    phone: string;
    otp: string;
    types: number;          // ✅ ປ່ຽນເປັນ number ໃຫ້ກົງກັບ INTEGER
    status: number;
    expiresAt: Date;       // ✅ ເພີ່ມ expiry
    attempts: number;      // ປ້ອນ OTP ຜິດຈັກເທື່ອ — ເກີນກຳນົດ = ຍົກເລີກ OTP (ກັນເດົາ)
    createdAt: Date;
    updatedAt: Date;
}

// ✅ Field ທີ່ optional ຕອນ create
type OTPCreationAttributes = Optional<
    OTPAttributes,
    "_uuid" | "status" | "attempts" | "createdAt" | "updatedAt"
>;

// ✅ Model
export class OTP
    extends Model<OTPAttributes, OTPCreationAttributes>
    implements OTPAttributes
{
    public _uuid!: string;
    public phone!: string;
    public otp!: string;
    public types!: number;
    public status!: number;
    public expiresAt!: Date;
    public attempts!: number;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

OTP.init(
    {
        _uuid: {
            type: DataTypes.UUID, 
            primaryKey: true,
            allowNull: false,
            defaultValue: DataTypes.UUIDV4, 
        },
        phone: {
            type: DataTypes.STRING(20), 
            allowNull: false,
        },
        otp: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
        types: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        status: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 1,
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        attempts: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        sequelize,
        modelName: "OTP",
        tableName: "tbl_otp",
        timestamps: true,                      // ✅ ໃຫ້ Sequelize ຈັດການ updatedAt ເອງ
        indexes: [
            { fields: ["phone"] },             // ✅ ຄົ້ນຫາໄວ
            { fields: ["phone", "status"] },
        ],
    }
);

autoSync(OTP);

export default OTP;
