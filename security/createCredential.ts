import { ApiKeyCreds, ClobClient } from "@polymarket/clob-client";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import { Wallet } from "@ethersproject/wallet";
import { Logger } from "../utils/logger";
import { config } from "../utils/config";

/**
 * Create or load Polymarket API credentials
 * Following the pattern from sample repositories
 */
export async function createCredential(): Promise<ApiKeyCreds | null> {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        Logger.error("PRIVATE_KEY not found");
        return null;
    }

    try {
        const wallet = new Wallet(privateKey);
        const chainId = config.chain.chainId;
        const host = config.clob.apiUrl;
        
        // Create temporary ClobClient just for credential creation
        const clobClient = new ClobClient(host, chainId, wallet);
        const credential = await clobClient.createOrDeriveApiKey();
        
        await saveCredential(credential);
        Logger.info("Credential created successfully");
        return credential;
    } catch (error) {
        Logger.error(`Error creating credential: ${error instanceof Error ? error.message : String(error)}`);
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
