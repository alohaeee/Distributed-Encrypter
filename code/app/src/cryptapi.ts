//import crypto, { Hash } from 'crypto';
function encryptCodes(content:string ,passcode: string) {
    var result = []; 
    var passLen = passcode.length ;
    for(var i = 0  ; i < content.length ; i++) {
        var passOffset = i%passLen ;
        var calAscii = (content.charCodeAt(i)+passcode.charCodeAt(passOffset));
        result.push(calAscii);
    }
    let str='';
    for(var i = 0 ; i < result.length ; i++) {
        var ch = String.fromCharCode(result[i]); str += ch ;
    }
    return str;
}
function decryptCodes (content:string ,passcode: string) {
    var result = [];
    var str = '';
    var passLen = passcode.length ;
    for(var i = 0  ; i < content.length ; i++) {
        var passOffset = i%passLen ;
        var calAscii = (content.charCodeAt(i)-passcode.charCodeAt(passOffset));
        result.push(calAscii) ;
    }
    for(var i = 0 ; i < result.length ; i++) {
        var ch = String.fromCharCode(result[i]); str += ch ;
    }
    return str;
}
function Encrypt(message: string, key: string)
{
    console.log(`Encrypt: ${message}, ${key}`);
    // let encrypter = crypto.createCipher('aes-128-gcm', key);
    // let encryptMessage =  Buffer.concat([encrypter.update(message), encrypter.final()]);
    let encryptMessage = encryptCodes(message, key);
    console.log(`Encrypt Result: ${encryptMessage}`);

    return Buffer.from(encryptMessage);
}

function Decrypt(message: string, key: string)
{
    console.log(`Decrypt message:${message}; key: ${key}`);
    // let decrypter = crypto.createDecipher('aes-128-gcm', key);
    // let decryptMessage = Buffer.concat([decrypter.update(message, 'hex'), decrypter.final()]);
    //let decryptMessage = decrypter.update(message, 'hex');
    let decryptMessage = decryptCodes(message, key);
    console.log(`Decrypt Result: ${decryptMessage}`);

    return Buffer.from(decryptMessage);
}

export function CallMethod(method: string, message: string, key: string)
{
    switch(method)
    {
        case 'Encrypt':
            return Encrypt(message, key);
        case 'Decrypt':
            return Decrypt(message, key);
        default:
            throw Error(`Can't find method: ${method}`);
    }
}

export default { CallMethod }
