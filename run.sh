#!/bin/bash

# require PhantomJS, WP-CLI
command -v phantomjs >/dev/null 2>&1 || { echo >&2 "This script requirs PhantomJS but it's not installed. Aborting."; exit 1; }
command -v wp >/dev/null 2>&1 || { echo >&2 "This script requirs wp-cli but it's not installed. Aborting."; exit 1; }

# Use aliases within script
shopt -s expand_aliases

usage() {
cat << EOF
usage: $0 options

OPTIONS:
   -h      Show this message
   -s      Run a pre-test script, eg: a site compile script
   -S      Run a post-test script, eg: to clean afterwards
   -b      Backup Database before upgrade
   -r      Site root directory, if not 'pwd'
   -t      Temp directory, defaults to /tmp/wp-upgrader
   -z      Zip log directory afterwards
   -Z      Zip log directory afterwards, to a specific file name
   -e      Environment to test 1: Front-end, 2: Back-end, 3: Both ( default )
   -E      Test status 1: Before upgrade, 2: After upgrade, 3: Both ( default ), 4: After ( But do not upgrade )
   -c      Take screenshots of pages
   -l      Use less in follow mode to track progress ( so you can scroll )
   -a      User:Pass to login with, defaults to wpupgrade:{dynamic-pass}
   -u      URL of the multisite installation to target with wp-cli
EOF
}

# Function to retry a command till it exists with zero exit code, separated by a confirmation message
# Usage: retry_command some_script arg1 arg2
retry_command() {
    $@
    local status=$?
    if [ $status -ne 0 ]; then
        read -p "> Command exited with non-zero status, Retry again ?" >&2
        retry_command "$@"
    fi
}

PRESCRIPT=
POSTSCRIPT=
BACKUPDB=
SITEROOT=`pwd`
TEMPDIR=/tmp/wp-upgrader
ZIPFILE=
DOZIP=
DOENV=3
DOSTEPS=3
LESSF=
USERPASS=wpupgrade:
TAKESHOTS=0
URL=

while getopts "hs:S:br:t:zZ:e:E:cla:u:" OPTION
do
     case $OPTION in
         h)
             usage
             exit 1
             ;;
         s)
             PRESCRIPT=$OPTARG
             ;;
         S)
             POSTSCRIPT=$OPTARG
             ;;
         b)
             BACKUPDB=1
             ;;
         r)
             SITEROOT=$OPTARG
             ;;
         t)
             TEMPDIR=$OPTARG
             ;;
         z)
             DOZIP=1
             ;;
         Z)
             DOZIP=1
             ZIPFILE=$OPTARG
             ;;
         e)
             DOENV=$OPTARG
             ;;
         E)
             DOSTEPS=$OPTARG
             ;;
         c)
             TAKESHOTS=1
             ;;
         l)
             LESSF=1
             ;;
         a)
             USERPASS=$OPTARG
             ;;
         u)
             URL=$OPTARG
             ;;
         ?)
             usage
             exit
             ;;
     esac
done


# Store script location
SCRIPT="`readlink -e $0`"
SCRIPTPATH="`dirname $SCRIPT`"

# Navigate to site root
cd "$SITEROOT"
# Check if WordPress is actually installed in this directory
wp core is-installed --url="$URL" 2>/dev/null
if [[ $? -ne 0 ]]; then echo 'This is not a valid WordPress install, aborting.' >&2; exit 1; fi;

# Run pre-test script
if [ ! -z "$PRESCRIPT" ]; then
    $PRESCRIPT
fi

# Extract site info using wp-cli
if [ -z "$URL" ]; then
	SITEURL=`wp option get siteurl --url="/" 2> /dev/null`
else
	SITEURL="$URL"
fi

alias wp="wp --url=\"$SITEURL\"" # To populate REQUEST_URI
SITEROOT=`wp eval 'echo realpath(ABSPATH);' 2> /dev/null`
WP_CONTENT_DIR=`wp eval 'echo WP_CONTENT_DIR;' 2> /dev/null`
SITEDOMAIN=`echo $SITEURL | sed 's/https*\:\/\///;s/\/$//'`
SAFEDOMAIN=`echo $SITEDOMAIN | sed 's/[^a-z\.]/-/g'`

# Script internal variables
RUNSCRIPT="$SCRIPTPATH/script"
HASH=`md5sum <<< "$SITEROOT $(date)" | awk '{ print $1 }'`
TMP="$TEMPDIR/$SAFEDOMAIN/$HASH"
TEMPLOGFILE="$TMP/upgrade.log"

# Create our tmp directory
echo "* Creating/Resetting temporary directory $TMP"
rm -fr $TMP
mkdir -p $TMP/{before,after}/shots/{front,back}
chmod -R 777 $TMP/{before,after}

# Progress tracking, less or tee ?
if [ -z $LESSF ]; then
    source $RUNSCRIPT 2>&1 | tee -a $TEMPLOGFILE
else
    source $RUNSCRIPT &>> $TEMPLOGFILE &
    less +F "$TEMPLOGFILE"
fi

# Create ZIP file
if [ ! -z $DOZIP ]; then
    if [ -z $ZIPFILE ]; then
        ZIPFILE="$TEMPDIR/$SAFEDOMAIN.zip"
    fi
    echo "* Creating ZIP file"
    zip -ro "$ZIPFILE" $TMP
    echo "* Created ZIP file at $ZIPFILE !"
fi

# Run pre-test script
if [ ! -z "$POSTSCRIPT" ]; then
    $POSTSCRIPT
fi
