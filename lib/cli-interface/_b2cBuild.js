'use strict';

// Initialize module dependencies
const config = require('config');
const logo = require('asciiart-logo');

// Initialize the CLI api
const cliAPI = require('../../index');

// Initialize local libraries
const cliUi = require('../../lib/cli-interface/ui');
const common = require('../../lib/cli-api/_common');
const getOperationMode = require('../../lib/cli-api/_common/_getOperationMode');
const getProgramOptionDefault = require('../../lib/cli-api/_common/_getProgramOptionDefault');

/**
 * @function b2cBuild
 * @description This function is generates the meta-data, deploy the meta-data and deploy the code to the B2C Commerce instance
 * Commands are abstracted in this manner to facilitate unit testing of each command separately.
 *
 * @param {Object} commandProgram Represents the CLI program to which the getEnvironment command is appended
 * @return {Object} Returns the updated commandProgram -- including the command that was just attached
 */
module.exports = commandProgram => {
    // Append the environment-get command to the parent program
    commandProgram
        .command('crm-sync:b2c:build')
        .requiredOption(config.get('cliOptions.b2cHostName.cli'), config.get('cliOptions.b2cHostName.description'), getProgramOptionDefault('b2cHostName'))
        .requiredOption(config.get('cliOptions.b2cClientId.cli'), config.get('cliOptions.b2cClientId.description'), getProgramOptionDefault('b2cClientId'))
        .requiredOption(config.get('cliOptions.b2cClientSecret.cli'), config.get('cliOptions.b2cClientSecret.description'), getProgramOptionDefault('b2cClientSecret'))
        .option(config.get('cliOptions.b2cCertificatePath.cli'), config.get('cliOptions.b2cCertificatePath.description'), getProgramOptionDefault('b2cCertificatePath'))
        .option(config.get('cliOptions.b2cCertificatePassphrase.cli'), config.get('cliOptions.b2cCertificatePassphrase.description'), getProgramOptionDefault('b2cCertificatePassphrase'))
        .requiredOption(config.get('cliOptions.b2cCodeVersion.cli'), config.get('cliOptions.b2cCodeVersion.description'), getProgramOptionDefault('b2cCodeVersion'))
        .requiredOption(config.get('cliOptions.b2cSiteIds.cli'), config.get('cliOptions.b2cSiteIds.description'), getProgramOptionDefault('b2cSiteIds'))
        .requiredOption(config.get('cliOptions.sfLoginUrl.cli'), config.get('cliOptions.sfLoginUrl.description'), getProgramOptionDefault('sfLoginUrl'))
        .requiredOption(config.get('cliOptions.sfUsername.cli'), config.get('cliOptions.sfUsername.description'), getProgramOptionDefault('sfUsername'))
        .requiredOption(config.get('cliOptions.sfPassword.cli'), config.get('cliOptions.sfPassword.description'), getProgramOptionDefault('sfPassword'))
        .requiredOption(config.get('cliOptions.sfSecurityToken.cli'), config.get('cliOptions.sfSecurityToken.description'), getProgramOptionDefault('sfSecurityToken'))
        .option(config.get('cliOptions.operationMode.cli'), config.get('cliOptions.operationMode.description'), getOperationMode, getProgramOptionDefault('operationMode'))
        .description('Generates the meta-data, deploy the meta-data and deploy the code to the B2C Commerce instance -- defaults to the .env; can be overridden via the CLI')
        .action(async commandObj => {
            const commandOptions = commandObj.opts();

            // Retrieve the runtime environment
            const environmentDef = cliAPI.getRuntimeEnvironment(commandOptions);
            // Generate the validation results for all dependent attributes
            const b2cConnProperties = common.getB2CConnProperties(environmentDef);
            const b2cCodeProperties = common.getB2CCodeVersion(environmentDef);
            const isJSONOperationMode = commandOptions.operationMode === config.get('operationMode.json');
            const output = {};

            try {
                if (!isJSONOperationMode) {
                    cliUi.cliCommandBookend(commandObj._name, 'start');
                    console.log(' -- Attempting to deploy the B2C code zip file generated by the "crm-sync:b2c:code:zip" command line');
                    console.log(' -- CLI-driven deployment was performed leveraging the following environment details');
                    cliUi.outputEnvironmentDef(environmentDef);
                }

                // Were any validation errors found with the connection properties?
                if (b2cConnProperties.isValid !== true || b2cCodeProperties.isValid !== true) {
                    cliUi.outputResults(undefined, config.get('errors.b2c.badEnvironment'));
                    return commandProgram;
                }

                // Sequence of the build
                // 1. Reset the deployment folders
                // 2. Generate the services.xml file
                // 3. Zip the meta-data
                // 4. Deploy the meta-data
                // 5. Zip the code
                // 6. Deploy the code
                // 7. Reset the deployment folders, again, to free-up space
                // 8. Add the cartridges to the cartridge path of the sites

                // Retrieve and output the results of the setup activity
                let resultObj = await cliAPI.b2cDeploySetup();
                if (isJSONOperationMode) {
                    output.beforeDeploymentReset = resultObj;
                } else {
                    // Render the reset results
                    console.log(' -- Deployment reset results');
                    cliUi.outputResults(resultObj.map(result => result.outputDisplay), undefined, 'cliTableConfig.pathsSummary');
                }

                // Generate the SFDX NamedCredentials (AM) meta-data template
                resultObj = await cliAPI.b2cServicesCreate(environmentDef);
                if (isJSONOperationMode) {
                    output.servicesCreation = resultObj;
                } else {
                    // Render the results
                    cliUi.outputTemplateResults(resultObj, undefined);
                }

                // Retrieve and output the results of the reset activity
                resultObj = await cliAPI.b2cDeployReset(config.get('paths.b2cLabel'), config.get('paths.metadataPathLabel'));
                if (isJSONOperationMode) {
                    output.metadataDeploymentReset = resultObj;
                } else {
                    // Render the results
                    console.log(' -- Metadata deployment reset results');
                    cliUi.outputResults([resultObj.outputDisplay], undefined, 'cliTableConfig.pathsSummary');
                }

                // Archive the B2C Commerce meta-data
                resultObj = await cliAPI.b2cZip(environmentDef, config.get('paths.b2cLabel'), config.get('paths.metadataPathLabel'));
                if (isJSONOperationMode) {
                    output.metadataZip = resultObj;
                } else {
                    // Render the results
                    console.log(' -- Metadata zipping results');
                    cliUi.outputResults([resultObj.ouputDisplay], undefined, 'cliTableConfig.zipSummary');
                }

                // Deploy the B2C meta-data
                resultObj = await cliAPI.b2cDeployData(environmentDef, config.get('paths.b2cLabel'), config.get('paths.metadataPathLabel'));
                if (isJSONOperationMode) {
                    output.metadataDeployment = resultObj;
                } else {
                    // Render the authentication details
                    cliUi.outputResults([resultObj.outputDisplay.authenticate], undefined, 'cliTableConfig.b2cAuthTokenOutput');
                    // Render the data deployment details
                    cliUi.outputResults([resultObj.outputDisplay.import], undefined, 'cliTableConfig.dataDeploymentOutput');
                }

                // Retrieve and output the results of the reset activity
                resultObj = await cliAPI.b2cDeployReset(config.get('paths.b2cLabel'), config.get('paths.cartridgePathLabel'));
                if (isJSONOperationMode) {
                    output.codeDeploymentReset = resultObj;
                } else {
                    // Render the results
                    console.log(' -- Code deployment reset results');
                    cliUi.outputResults([resultObj.outputDisplay], undefined, 'cliTableConfig.pathsSummary');
                }

                // Archive the B2C Commerce code-versions
                resultObj = await cliAPI.b2cZip(environmentDef, config.get('paths.b2cLabel'), config.get('paths.cartridgePathLabel'));
                if (isJSONOperationMode) {
                    output.codeZip = resultObj;
                } else {
                    // Render the results
                    console.log(' -- Code zipping results');
                    cliUi.outputResults([resultObj.ouputDisplay], undefined, 'cliTableConfig.zipSummary');
                }

                // Verify and output the configured B2C Commerce code version
                resultObj = await cliAPI.b2cDeployCode(environmentDef, config.get('paths.b2cLabel'), config.get('paths.cartridgePathLabel'));
                if (isJSONOperationMode) {
                    output.codeDeployment = resultObj;
                } else {
                    // Render the authentication details
                    cliUi.outputResults([resultObj.outputDisplay.authenticate], undefined, 'cliTableConfig.b2cAuthTokenOutput');
                    // Render the code deployment details
                    cliUi.outputResults([resultObj.outputDisplay.codeVersionGet], undefined, 'cliTableConfig.codeVersionOutput');
                }

                resultObj = await cliAPI.b2cDeploySetup();
                if (isJSONOperationMode) {
                    output.afterDeploymentReset = resultObj;
                } else {
                    // Render the results
                    console.log(' -- Deployment reset results');
                    cliUi.outputResults(resultObj.map(result => result.outputDisplay), undefined, 'cliTableConfig.pathsSummary');
                }

                // Add the cartridges to the site's cartridge paths
                resultObj = await cliAPI.b2cSitesCartridgesAdd(environmentDef);
                if (isJSONOperationMode) {
                    output.afterDeploymentReset = resultObj;
                } else {
                    if (resultObj.outputDisplay.verifySites.success.length > 0) {
                        // Render the site verification details for success sites
                        console.log(' -- Sites verification details - successfully verified these sites:');
                        cliUi.outputResults(resultObj.outputDisplay.verifySites.success, undefined, 'cliTableConfig.siteOutput');
                    }
                    if (resultObj.outputDisplay.verifySites.error.length > 0) {
                        // Render the site verification details for error sites
                        console.log(' -- Sites verification details - failed to verify these sites:');
                        cliUi.outputResults(resultObj.outputDisplay.verifySites.error, undefined, 'cliTableConfig.siteErrors');
                    }

                    console.log(' -- Cartridge add operation details');
                    cliUi.outputB2CCartridgeAddResults(resultObj);
                }

                // Print the output in case of JSON mode, which is an aggregate of all the subsequent results
                if (isJSONOperationMode) {
                    console.log('%s', JSON.stringify(output, null, 2));
                } else {
                    console.log(logo({
                        name: 'SUCCESS!',
                        font: 'Electronic',
                        lineChars: 10,
                        padding: 2,
                        margin: 2,
                        borderColor: 'black',
                        logoColor: 'bold-green',
                        textColor: 'green'
                    })
                        .emptyLine()
                        .right('- Brought to You by the Full Power of Salesforce Architects')
                        .right('Architect Success, SCPPE, Services, & Alliances')
                        .emptyLine()
                        .render()
                    );
                }
            } catch (e) {

                console.log(e);

                console.log(
                    logo({
                        name: 'FAILED!',
                        font: 'Electronic',
                        lineChars: 10,
                        padding: 2,
                        margin: 2,
                        borderColor: 'black',
                        logoColor: 'bold-red',
                        textColor: 'red'
                    })
                        .emptyLine()
                        .right('- Inspect Each of the Following Exceptions Reported hereafter')
                        .right('Validate your environment details.')
                        .emptyLine()
                        .render()
                );

                cliUi.outputResults(undefined, JSON.stringify(e, null, 4));
            } finally {
                if (!isJSONOperationMode) {
                    cliUi.cliCommandBookend(commandObj._name, 'end');
                }
            }
        });

    // Return the program with the appended command
    return commandProgram;
};