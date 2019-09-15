'use strict'

const _ = require('underscore');
const vasync = require('vasync');
const fs = require('fs');
const path = require('path');

const logger = require('src/logger');
const Config = require('src/config');
const MALCoverCSSDB = require('src/models/MALCoverCSSDB');

//-----------------------------------------------------------------------------
// Generator
//-----------------------------------------------------------------------------

module.exports = function generateCSS(onComplete) {
    logger.header('Starting to generate css');
    let dbmgr = MALCoverCSSDB.connect();

    let jobBarrier = vasync.barrier();
    jobBarrier.on('drain', function() {
        logger.info('Finished generating CSS');
        onComplete();
    });

    const mediaTypes = ['all', 'anime', 'manga'];
    const selectors = ['self', 'before', 'after', 'more'];
    const cssToGenerate = crossProduct(mediaTypes, selectors);

    for (let css of cssToGenerate) {
        generate(dbmgr, jobBarrier, css[0], css[1]);
    }
}

//-----------------------------------------------------------------------------
// Helpers
//-----------------------------------------------------------------------------

function crossProduct() {
    return _.reduce(arguments, function(a, b) {
        return _.flatten(_.map(a, function(x) {
            return _.map(b, function(y) {
                return x.concat([y]);
            });
        }), true);
    }, [ [] ]);
}

function generate(dbmgr, jobBarrier, mediaType, selector) {
    if (mediaType === 'all' && selector === 'more') {
        // The '#more[mal id]' selector is based on MAL's id which is not unique for both manga and anime
        // i.e. different manga/anime can share the same id
        return;
    }

    const fileName = path.join(__dirname, '../public/generated/' + mediaType + '-' + selector + '.css');
    jobBarrier.start(fileName);

    dbmgr.getMALItems(mediaType, (items) => {
        let cssFileStream = fs.createWriteStream(fileName, { flags: 'w' });
        cssFileStream.on('error', function(error) {
            logger.error("Failed to write file '%s'", fileName, error);
        });
        cssFileStream.write('/* This file was generated by https://www.malcovercss.link */\n\n');

        for (let item of items) {
            let cssRule = getCSSRule(selector, mediaType, item.malId, item.imgUrl);
            cssFileStream.write(cssRule);
        }

        logger.info("Finished writing to '%s'", fileName);
        cssFileStream.end();
        jobBarrier.done(fileName);
    });
}

function getCSSRule(selector, mediaType, malId, imgUrl) {
    let cssRule = '';

    switch (selector) {
        case 'more':
            cssRule += '#more' + malId;
            break;

        case 'self':
            cssRule += '.animetitle';
            cssRule += '[href^="/' + mediaType + '/' + malId + '/"]';
            break;

        case 'before':
        case 'after':
            cssRule += '.animetitle';
            cssRule += '[href^="/' + mediaType + '/' + malId + '/"]:' + selector;
            break;
    }

    cssRule += '{background-image:url(' + imgUrl + ');}\n';
    return cssRule;
}