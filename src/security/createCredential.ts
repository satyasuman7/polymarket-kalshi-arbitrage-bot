import { ApiKeyCreds, ClobClient } from "@polymarket/clob-client";
import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { resolve } from "path";
import { Wallet } from "@ethersproject/wallet";
import { config } from "../utils/config";

/**
 * Create or load Polymarket API credentials
 * Following the pattern from sample repositories
 * Checks if credentials already exist before creating new ones
 */
export async function createCredential(): Promise<ApiKeyCreds | null> {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.log("[ERROR] PRIVATE_KEY not found");
        return null;
    }

    // Check if credentials already exist
    const credentialPath = resolve(process.cwd(), "src/data/credential.json");
    if (existsSync(credentialPath)) {
        try {
            const existingCreds = JSON.parse(readFileSync(credentialPath, "utf-8"));
            console.log("[INFO] Credentials already exist. Using existing credentials.");
            return existingCreds;
        } catch (error) {
            console.log("[WARNING] Failed to read existing credentials, creating new ones...");
        }
    }

    try {
        const wallet = new Wallet(privateKey);
        console.log(`[INFO] Creating credentials for wallet address: ${wallet.address}`);
        const chainId = config.chain.chainId;
        const host = config.clob.apiUrl;
        
        // Create temporary ClobClient just for credential creation
        const clobClient = new ClobClient(host, chainId, wallet);
        const credential = await clobClient.createOrDeriveApiKey();
        
        await saveCredential(credential);
        console.log("[INFO] Credential created successfully");
        return credential;
    } catch (error) {
        console.log(`[ERROR] Error creating credential: ${error instanceof Error ? error.message : String(error)}`);
        return null;
    }
}   

/**
 * Save credentials to file
 */
export async function saveCredential(credential: ApiKeyCreds): Promise<void> {
    const credentialPath = resolve(process.cwd(), "src/data/credential.json");
    
    // Ensure directory exists
    const dir = resolve(process.cwd(), "src/data");
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(credentialPath, JSON.stringify(credential, null, 2));
}
