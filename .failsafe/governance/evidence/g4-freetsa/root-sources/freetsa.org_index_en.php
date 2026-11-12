<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <!-- The above 3 meta tags *must* come first in the head; any other head content must come *after* these tags -->
    <title>Free Time Stamp Authority</title>

    <!-- Bootstrap + https://github.com/designmodo/Flat-UI -->
    <link href="public/css/bootstrap.min.css" rel="stylesheet">
    <link href="public/css/flat-ui.min.css" rel="stylesheet">
    <link href="public/css/custom.css?load=2" rel="stylesheet">
    <link rel="icon" type="image/x-icon" href="public/images/favicon.ico">
    
    <link rel="alternate" hreflang="es" href="index_es.php" />
    <link rel="alternate" hreflang="de" href="index_de.php" />
    <link rel="alternate" hreflang="en" href="index_en.php" />
    <link rel="alternate" hreflang="zh" href="index_zh.php" />
    <link rel="alternate" hreflang="zhtc" href="index_zhtc.php" />
    <link rel="alternate" hreflang="cat" href="index_cat.php" />

    <!-- HTML5 shim and Respond.js for IE8 support of HTML5 elements and media queries -->
    <!-- WARNING: Respond.js doesn't work if you view the page via file:// -->
    <!--[if lt IE 9]>
      <script src="https://oss.maxcdn.com/html5shiv/3.7.3/html5shiv.min.js"></script>
      <script src="https://oss.maxcdn.com/respond/1.4.2/respond.min.js"></script>
    <![endif]-->
  </head>
  <body>
    <nav class="navbar navbar-default">
  <div class="container">
    <!-- Brand and toggle get grouped for better mobile display -->
    <div class="navbar-header">
      <button type="button" class="navbar-toggle collapsed" data-toggle="collapse" data-target="#bs-example-navbar-collapse-1" aria-expanded="false">
        <span class="sr-only">Toggle navigation</span>
        <span class="icon-bar"></span>
        <span class="icon-bar"></span>
        <span class="icon-bar"></span>
      </button>
      <a class="navbar-brand" href="#">freeTSA.org</a>
    </div>

    <!-- Collect the nav links, forms, and other content for toggling -->
    <div class="collapse navbar-collapse" id="bs-example-navbar-collapse-1">
      <ul class="nav navbar-nav navbar-right">
        <li><a href="#tcp">TCP-based</a></li>
        <li><a href="#online">Online form</a></li>
        <li><a href="#url">URL Screenshot</a></li>
        <li class="dropdown">
            <a href="#" class="dropdown-toggle" data-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false"><img alt="en" src="public/images/en.png" /> <span class="caret"></span></a>
          <ul class="dropdown-menu">
            <li><a href="index_es.php"><img alt="es" src="public/images/es.png" />  Spanish</a></li>
            <li><a href="index_cat.php"><img alt="cat" src="public/images/cat.png" />  Catalan</a></li>
            <li><a href="index_de.php"><img alt="de" src="public/images/de.png" />  German</a></li>
            <li><a href="index_zh.php"><img alt="zh" src="public/images/zh.png" />  Chinese</a></li>
            <li><a href="index_zhtc.php"><img alt="zhtc" src="public/images/zhtc.png" />  Traditional Chinese</a></li>
          </ul>
        </li>
      </ul>
    </div><!-- /.navbar-collapse -->
  </div><!-- /.container-fluid -->
</nav>
      
      <div class="container">
          <div class="jumbotron clearfix">
              <img class="img-responsive pull-right" src="public/images/tsa.png" />
            <h1>Time Stamp Authority</h1>
            <p>freeTSA.org provides a free Time Stamp Authority. Adding a trusted timestamp to code or to an electronic signature provides a digital seal of data integrity and a trusted date and time of when the transaction took place.
</p>
<form action="https://www.paypal.com/donate" method="post" target="_top">
<input type="hidden" name="hosted_button_id" value="J4MFQ54YGNCW8" />
<input type="image" src="https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif" border="0" name="submit" title="Donate!" alt="Donate with PayPal button" />
<img alt="" border="0" src="https://www.paypal.com/en_DE/i/scr/pixel.gif" width="1" height="1" />
</form>
          </div>
      </div>
      
      <div class="container">
<b>Important</b>: The tsa.crt certificate has been updated and modernized. The validity of timestamps from March 16, 2026, is until February 2040. The time stamps now use Elliptic-curve cryptography P-384 (secp384r1). The old certificate (no longer valid as of March 2026) can be downloaded here: <b>Freetsa 2016-2026 Old TSA Certificate:</b> <a href="files/tsa.crt_expired">tsa.crt_expired</a><br>
<hr>
          Trusted timestamping is the process of securely keeping track of the creation and modification times of a document. Security here means that no one - not even the owner of the document -  should be able to change it once it has been recorded provided that the timestamper's integrity is never compromised. FreeTSA trusted timestamping Software as a Service (SaaS) provides an easy method to apply RFC 3161 trusted timestamps to time-sensitive transactions through independently verified and auditable date and UTC (Coordinated Universal Time) sources.<br><br>

        Adding a trusted timestamp to code or to an electronic signature provides a digital seal of data integrity and a trusted date and time of when the transaction took place. Recipients of documents and code with a trusted timestamp can verify when the document or code was digitally or electronically signed, as well as verify that the document or code was not altered after the date the timestamp vouches for. (<a href="http://en.wikipedia.org/wiki/Trusted_timestamping">Readme</a>). <br><br>

	For multiple files, the general concept is that timestamping a single file that contains an aggregate list of fingerprints of other files, also proves that these other files must have existed before the aggregate file was created, provided that both the aggregate file and the referenced file are available during verification process. Freetsa also offers the possibility of URLs timestamps (do not abuse). If you want to implement timestamps in a project using the FreeTSA service, please read the <a href="freetsa.html">usage policies</a>. Freetsa can also be used within the <a href="https://www.torproject.org/">Tor</a> anonymity network.<br><br>

Making timestamps from Android/iOS devices is possible and no software installation is required (<a href="https://www.youtube.com/watch?v=LCLH7sqV16s&cc_load_policy=1">Video</a>). To timestamp a picture you must go to the "<a href="#tap-stamp">Online Signature</a>" section in the browser, click "Choose a file" and select "Use camera". Once the photo or video are completed, you can download the timestamp (TimeStampResponse). Just that. You also may select any other file available in the device if you choose so.<br><br>

	Freetsa.org offers free <a href="#other">OCSP</a> and  <a href="#other">CRL</a>, <a href="#other">NTP</a>, <a href="#other">DNSCRYPT</a>, <a href="#other">DNS</a> (Port 53) and <a href="https://en.wikipedia.org/wiki/DNS_over_TLS">DNS over TLS</a> (<a href="#other">DoT</a>) services for time synchronisation and encrypted name resolution respectively. The resolution of DNSCRYPT (Port 553) do not have any type of restriction (SPAM, Malware, Parental,...). No logs are saved. Like the rest of the services offered by FreeTSA, DoT accepts TCP connections to port 853 on all its IPv4/IPv6 addresses.<br><br>
        
        <a href="/guide" target="_blank">Guide: How to sign PDF documents files with time stamp</a><br/>
        <b>FreeTSA onion domain (Tor)</b>: <a href="https://4bvu5sj5xok272x6cjx4uurvsbsdigaxfmzqy3n3eita272vfopforqd.onion/">4bvu5sj5xok272x6cjx4uurvsbsdigaxfmzqy3n3eita272vfopforqd.onion</a> (https /http).<br>
        <b>RFC 3161 TSA</b>: <a href="https://www.ietf.org/rfc/rfc3161.txt">Time-Stamp Protocol (TSP).</a><br/>
        <b>RFC 958 NTP</b>: <a href="https://www.ietf.org/rfc/rfc958.txt">Network Time Protocol (NTP).</a><br/>
        
        <a class="label label-info" href="https://www.ssllabs.com/ssltest/analyze.html?d=freetsa.org">SSL Labs.</a>
        <a class="label label-info" href="https://crt.sh/?q=www.freetsa.org">Certificate Transparency</a>
        <a class="label label-info" href=http://www.pool.ntp.org/user/Busindre>NTP Pool Project associate membership.</a>
        <br/><br/>
         </div>
      
      <div class="bg2">
      <div class="container" style="overflow: auto;">
          <b>Request Digest:</b> sha1 / sha224 / sha256 / sha384 / sha512.<br><br>
          <b>Freetsa TSA Certificate:</b> <a href="files/tsa.crt">tsa.crt</a><br>
            SHA256: 8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467<br>
            <br>
            <b>Freetsa CA Certificate:</b> <a href="files/cacert.pem">cacert.pem</a><br>
            SHA256: 2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438
      </div>
      </div>
      
      <div class="container" id="tcp">
          <br/><h2 class="h3">Basics: TCP-based client</h2>
          <br/>
          <ul class="nav nav-tabs" role="tablist">
                <li role="presentation" class="active"><a href="#tap-tcp-1" role="tab" data-toggle="tab">Basics</a></li>
                <li role="presentation"><a href="#tap-tcp-2" role="tab" data-toggle="tab">full example</a></li>
                <li role="presentation"><a href="#tap-tcp-3" role="tab" data-toggle="tab">perl client</a></li>
            </ul>
            <br/>
            <!-- Tab panes -->
            <div class="tab-content">
                <div role="tabpanel" class="tab-pane active" id="tap-tcp-1">
                    Create a tsq (TimeStampRequest) file, which contains a hash of the file you want to sign.
                    <pre><code>$ openssl ts -query -data file.png -no_nonce -sha512 -cert -out file.tsq</code></pre>
                    Send the TimeStampRequest to freeTSA.org and receive a tsr (TimeStampResponse) file.            
                    <pre><code>$ curl -H "Content-Type: application/timestamp-query" --data-binary '@file.tsq' https://freetsa.org/tsr > file.tsr</code></pre>
                    With the public Certificates you can verify the TimeStampRequest.
                    <pre><code>$ openssl ts -verify -in file.tsr -queryfile file.tsq -CAfile cacert.pem -untrusted tsa.crt</code></pre>
                </div>
                <div role="tabpanel" class="tab-pane" id="tap-tcp-2">
                    <pre><code>###########################################################
# 1. create a tsq file (SHA 512)
###########################################################
openssl ts -query -data file.png -no_nonce -sha512 -out file.tsq

# Option -cert: FreeTSA is expected to include its signing certificate (Root + Intermediate Certificates) in the response. (Optional)
# If the tsq was created with the option "-cert", its verification does not require "-untrusted".
#$ openssl ts -query -data file.png -no_nonce -sha512 -cert -out file.tsq


# How to make Timestamps of many files?

# To timestamp multiple files, create a text file with all their SHA-512 hashes and timestamp it.
# Alternatively, you may pack all the files to be timestamped in a zip/rar/img/tar, etc file and timestamp it.

# Generate a text file with all the hashes of the /var/log/ files
$ find /var/log/ -type f -exec sha512sum {} + > compilation.txt

###########################################################
# 2. cURL Time Stamp Request Input (HTTP / HTTPS)
###########################################################

# HTTP 2.0 in cURL: Get the latest cURL release and use this command: curl --http2.
curl -H "Content-Type: application/timestamp-query" --data-binary '@file.tsq' https://freetsa.org/tsr > file.tsr

# Using the Tor-network.
#$ curl -k --socks5-hostname 127.0.0.1:9050 -H "Content-Type: application/timestamp-query" --data-binary '@file.tsq' https://4bvu5sj5xok272x6cjx4uurvsbsdigaxfmzqy3n3eita272vfopforqd.onion/tsr > file.tsr

# tsget is very useful to stamp multiple time-stamp-queries: https://docs.openssl.org/master/man1/tsget/
#$ tsget -h https://freetsa.org/tsr file1.tsq file2.tsq file3.tsq

###########################################################
# 3. Verify tsr file
###########################################################

wget https://freetsa.org/files/tsa.crt
wget https://freetsa.org/files/cacert.pem

# Timestamp Information.
openssl ts -reply -in file.tsr -text

# Verify (two diferent ways).
# openssl ts -verify -data file -in file.tsr -CAfile cacert.pem -untrusted tsa.crt 
openssl ts -verify -in file.tsr -queryfile file.tsq -CAfile cacert.pem -untrusted tsa.crt
# Verification: OK</code></pre>
                </div>
                <div role="tabpanel" class="tab-pane" id="tap-tcp-3">
                    <b>Client script download:</b> <a href="files/client.pl">client.pl</a><br><br>


                    <b>How to use TSA TCP-based client (IPv4/IPv6).</b>

                    <pre>$ perl client.pl freetsa.org 318 file

client: tsq file: file.tsq 
client: tsr file: file.tsr 
client: [Connected to freetsa.org:318]
client: client: transfer of the file.tsq to the server completed 
client: 40	file.tsq

# By default the TSQ file asks for the certificate chain (Root and Intermediate) to be provided in the response. 
# If you do not wish to do this you must change line 16 to line 15 of the script.
</pre>
                </div>
            </div>
          <br/><br/>
      </div>
      
       <div class="bg2" id="online">
           <div class="container">
               <h2 class="h3">Online Signature</h2>
               <br/>
               <div>
                    <!-- Nav tabs -->
                    <ul class="nav nav-tabs" role="tablist">
                      <li role="presentation" class="active"><a href="#tap-stamp" aria-controls="home" role="tab" data-toggle="tab">Stamp</a></li>
                      <li role="presentation"><a href="#tap-verify" aria-controls="profile" role="tab" data-toggle="tab">Verify</a></li>
                    </ul>
                    <br/>
                    <!-- Tab panes -->
                    <div class="tab-content">
                        <div role="tabpanel" class="tab-pane active" id="tap-stamp">
                            <div class="row">
                                <div class="col-sm-3">
                                     <input type="file" name="file-1[]" id="file-1" class="inputfile inputfile-block" data-multiple-caption="{count} files selected" data-callback="selectFile" />
                                     <label for="file-1"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="17" viewBox="0 0 20 17"><path d="M10 0l-5.2 4.9h3.3v5.1h3.8v-5.1h3.3l-5.2-4.9zm9.3 11.5l-3.2-2.1h-2l3.4 2.6h-3.5c-.1 0-.2.1-.2.1l-.8 2.3h-6l-.8-2.2c-.1-.1-.1-.2-.2-.2h-3.6l3.4-2.6h-2l-3.2 2.1c-.4.3-.7 1-.6 1.5l.6 3.1c.1.5.7.9 1.2.9h16.3c.6 0 1.1-.4 1.3-.9l.6-3.1c.1-.5-.2-1.2-.7-1.5z"/></svg> <span>Choose a file&hellip;</span></label>

                                </div>
                                <div class="col-sm-9">
                                      The file never leaves your browser. Download the TimeSpamtQuery or Response.
                                    <div id="reqireMessage" class="alert alert-danger" style="display: none;">
                                        Please select a File.
                                    </div>
                                   
                                    <form action="webservice.php" method="POST" id="fileform" data-event="submitStamp">
                                        <input type="hidden" name="d" id="d" />
                                        <input type="hidden" name="n" id="n" />
                                        <input type="hidden" name="h" id="h" />

                                        <button name="m" type="submit" class="btn btn-default btn-block" value="tsq">Download TimeStampRequest file</button>
                                        <button name="m" type="submit" class="btn btn-default btn-block" value="tsr">Download TimeStampResponse file</button>
                                    </form>                                    
                                    
                               </div>
                            </div>
                            
                        </div>
                        <div role="tabpanel" class="tab-pane" id="tap-verify">
                            <div class="row">
                                <div class="col-sm-6">
                                     <input type="file" name="file-tsq" id="file-tsq" class="inputfile inputfile-block" data-multiple-caption="{count} files selected" data-callback="verifirer.selectFileTSQ" />
                                     <label for="file-tsq"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="17" viewBox="0 0 20 17"><path d="M10 0l-5.2 4.9h3.3v5.1h3.8v-5.1h3.3l-5.2-4.9zm9.3 11.5l-3.2-2.1h-2l3.4 2.6h-3.5c-.1 0-.2.1-.2.1l-.8 2.3h-6l-.8-2.2c-.1-.1-.1-.2-.2-.2h-3.6l3.4-2.6h-2l-3.2 2.1c-.4.3-.7 1-.6 1.5l.6 3.1c.1.5.7.9 1.2.9h16.3c.6 0 1.1-.4 1.3-.9l.6-3.1c.1-.5-.2-1.2-.7-1.5z"/></svg> <span>Choose a tsq file&hellip;</span></label>
                                     
                                </div>
                                <div class="col-sm-6">
                                    <input type="file" name="file-tsr" id="file-tsr" class="inputfile inputfile-block" data-multiple-caption="{count} files selected" data-callback="verifirer.selectFileTSR" />
                                     <label for="file-tsr"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="17" viewBox="0 0 20 17"><path d="M10 0l-5.2 4.9h3.3v5.1h3.8v-5.1h3.3l-5.2-4.9zm9.3 11.5l-3.2-2.1h-2l3.4 2.6h-3.5c-.1 0-.2.1-.2.1l-.8 2.3h-6l-.8-2.2c-.1-.1-.1-.2-.2-.2h-3.6l3.4-2.6h-2l-3.2 2.1c-.4.3-.7 1-.6 1.5l.6 3.1c.1.5.7.9 1.2.9h16.3c.6 0 1.1-.4 1.3-.9l.6-3.1c.1-.5-.2-1.2-.7-1.5z"/></svg> <span>Choose a tsr file&hellip;</span></label>
                                     
                                </div>
                            </div>
                            <div id="reqireMessage2" class="alert alert-danger" style="display: none;">
                                        Please select a tsq and a tsr file.
                            </div>
                            <div>
                                    Select a tsq and a tsr file.
                                    <a class="btn btn-default btn-block" data-event="verify">verify</a>
                            </div>
                            
                            <div id="messageWait2" style="display: none" class="alert alert-info">
                                Please wait.
                            </div>
                            <div id="messageError2" style="display: none" class="alert alert-danger">
                                Error: Did you have select a tsq and a tsr file?
                            </div>
                            
                            <div id="divVerifyStatus" style="display: none" class="alert alert-info">
                                
                            </div>
                            
                            <div id="divVerifyInfo">
                                
                            </div>
                            
                        </div>
                    </div>

                </div>
           </div>
       </div>
      
      <div class="container" id="url">
         <br/> <h2 class="h3">URL screenshot</h2>
         
         <div>
            <ul class="nav nav-tabs" role="tablist">
                <li role="presentation" class="active"><a href="#tap-url-1" role="tab" data-toggle="tab">Basics</a></li>
                <li role="presentation"><a href="#tap-url-2" role="tab" data-toggle="tab">REST API</a></li>
                <li role="presentation"><a href="#tap-url-3" role="tab" data-toggle="tab">Screenshot browser button.</a></li>
            </ul>
            <br/>
            <!-- Tab panes -->
            <div class="tab-content">
                <div role="tabpanel" class="tab-pane active" id="tap-url-1">
                    <b>URL screenshot: Signature + URL timestamps.</b> (<a target="_blank" href="https://www.youtube.com/watch?v=KZ5ygyFGieo">Video</a>)<br>
                    <br/>
                    Create evidence of
                    <ul>
                        <li>Illegal Internet content / non-repudiation of certain content.</li>
                        <li>Deleted / Edited controversial news.</li>
                        <li>Slander, threats or insults on Internet (social networks) / Scams.</li>
                        <li>Misuse of intellectual property: articles, photographs, plagiarism, etc.</li>
                        <li>Publication of unauthorized information</li>
                        <li>Simply demonstrate the existence of a specific content at a specific time.</li>
                    </ul>
                     
                </div>
                <div role="tabpanel" class="tab-pane" id="tap-url-2">
                    <pre>$ <strong>curl --data "screenshot=https://www.fsf.org/&delay=n" https://freetsa.org/screenshot.php > screenshot.pdf</strong>
$ curl --data "screenshot=https://www.fsf.org/&delay=y" https://freetsa.org/screenshot.php > screenshot.pdf # (I'm Feeling Lucky)

### HTTP 2.0 in cURL: Get the latest cURL release and use this command: curl --http2.

### REST API in Tor: Add "-k --socks5-hostname localhost:9050".

# Normal domains within the Tor-network.
$ curl -k --socks5-hostname localhost:9050 --data "screenshot=https://www.fsf.org/&delay=y" https://4bvu5sj5xok272x6cjx4uurvsbsdigaxfmzqy3n3eita272vfopforqd.onion/screenshot.php > screenshot.pdf

# ".onion" domain within the Internet.
$ curl -k --data "screenshot=https://4bvu5sj5xok272x6cjx4uurvsbsdigaxfmzqy3n3eita272vfopforqd.onion/&delay=y&tor=y" https://freetsa.org/screenshot.php > screenshot.pdf

# ".onion" domain within the Tor network.
$ curl -k --socks5-hostname localhost:9050 --data "screenshot=https://4bvu5sj5xok272x6cjx4uurvsbsdigaxfmzqy3n3eita272vfopforqd.onion/&delay=y&tor=y" https://4bvu5sj5xok272x6cjx4uurvsbsdigaxfmzqy3n3eita272vfopforqd.onion/screenshot.php > screenshot.pdf</pre>
                </div>
                
                <div role="tabpanel" class="tab-pane" id="tap-url-3">
                    <b>Option 1: Screenshot browser button.</b><br>
                    1. Drag the bookmarklet "<a href='javascript:(function(){ var post_to_url = function(path, params, method) {var openWindow = window.open(path,"_blank"); openWindow.focus();  method = method || "post"; var form = openWindow.document.createElement("form"); form.setAttribute("method", method); form.setAttribute("action", path);for(var key in params) {  var hiddenField = document.createElement("input");hiddenField.setAttribute("type", "hidden");hiddenField.setAttribute("name", key);hiddenField.setAttribute("value", params[key]);form.appendChild(hiddenField);}openWindow.document.body.appendChild(form);form.submit(); }; post_to_url( "https://freetsa.org/screenshot.php",  {screenshot:window.location.href,delay:"n"}); })();'>URL screenshot</a>" to your Bookmarks Toolbar or Links Bar.<br>
                    2. While viewing a page you want to use the bookmarklet on, click the bookmarklet from your Bookmarks Toolbar.<br><br>


                    <b>Option 2: Screenshot browser button (with icon).</b><br>
                    Integrating an easy "URL screenshot" button in your favorite browser. (Download <a href="bookmark.php">bookmark</a>).<br><br>

                     - Firefox: <a href="https://support.mozilla.org/en-US/kb/import-bookmarks-html-file">Import Bookmark</a> / <a href="https://support.mozilla.org/en-US/kb/bookmarks-toolbar-display-favorite-websites">Toolbar Button</a>.<br>
                     - Opera:<a href="http://help.opera.com/Windows/12.10/en/importexport.html">Import Bookmark</a> / <a href="http://help.opera.com/Windows/12.10/en/bookmarks.html">Toolbar Button</a>.<br>
                     - Chrome: <a href="https://support.google.com/chrome/answer/96816?hl=en">Import Bookmark</a> / <a href="https://support.google.com/chrome/answer/95745?hl=en">Toolbar Button</a>.
                    
                </div>
            </div>
         </div>
         <br/><br/>
      </div>
      
      
      <div class="bg2" >
          <div class="container">
              <h2 class="h3">URL screenshot online</h2>
                     Web content and links in PDF / PNG format (attachment) + Signature with Timestamping (SHA-512). Aprox wait time 25 secons.

                    <form name="screenshot" method="post"  action="https://freetsa.org/screenshot.php">
                        <div class="clearfix">
                            <label class="checkbox checkbox-inline">
                                <input type="radio" name="delay" value="n" checked>  Normal.
                            </label>
                            <label class="checkbox checkbox-inline">
                                <input type="radio" name="delay" value="y"> I'm Feeling Lucky (slower).
                            </label>
                            <label class="checkbox checkbox-inline">
                                <input type="checkbox" id="tor" name="tor" value="y" > TOR ".onion" domain / Web visited through the Tor-network
                            </label>
                        </div>
                        <div class="row">
                            <div class="col-sm-9">
                                <input type="text" name="screenshot" class="form-control" size="120" value="http://">
                            </div>
                            <div class="col-sm-3">
                                <input type="submit" class="btn btn-primary btn-block" value="URL screenshot">
                            </div>
                        </div>
                        Browser agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:84.0) Gecko/20100101 Firefox/84.0'
                    </form>
          </div>
      </div>
      
      <div class="container" id="other">
          <h2 class="h3">Other informations</h2>
          <br/>
          <div>
            <ul class="nav nav-tabs" role="tablist">
                <li role="presentation" class="active"><a href="#tap-other-1" role="tab" data-toggle="tab">OCSP and CRL</a></li>
                <li role="presentation"><a href="#tap-other-3" role="tab" data-toggle="tab">NTP, DNS, DoT and DNSCRYPT</a></li>
            </ul>
            <br/>
            <!-- Tab panes -->
            <div class="tab-content">
                <div role="tabpanel" class="tab-pane active" id="tap-other-1">
                      <b><u><a id="ocsp">OCSP SERVER:</a></u></b> <i>http://www.freetsa.org:2560</i><br>
			<pre>
# Certificate files. 
openssl ocsp -sha512 -CAfile cacert.pem -issuer cacert.pem -cert tsa.crt -url http://freetsa.org:2560 -resp_text
openssl ocsp -sha512 -CAfile cacert.pem -issuer cacert.pem -cert cacert.pem -url http://freetsa.org:2560 -resp_tex

# Serial number.
openssl ocsp -sha512 -CAfile cacert.pem -issuer cacert.pem -serial "0xC2E986160DA8E9CD" -url http://freetsa.org:2560 -resp_text
openssl ocsp -sha512 -CAfile cacert.pem -issuer cacert.pem -serial "0xC1E986160DA8E980" -url http://freetsa.org:2560 -resp_text
</pre><br>

                        <b><u><a id="crl">CRL (Revocation List):</a></u></b> <i>https://www.freetsa.org/crl/root_ca.crl</i><br>
                        <pre>$ wget http://www.freetsa.org/crl/root_ca.crl
$ openssl crl -in root_ca.crl -noout -text</pre><br>
                </div>
                <div role="tabpanel" class="tab-pane" id="tap-other-3">
                    <b><u><a id="dns">NTP, DNS, DoT and DNSCRYPT services</a></u></b><br>
<pre>
## Normal DNS (Port 53): Any freeTSA IP (IPv4 or IPv6) will give you normal DNS resolution service.

## NTP Server: freetsa.org (IPv4 / IPv6)

$ ntpdate freetsa.org

## Freetsa offers DoT on port 853 (IPv4 / IPv6). Systemd-resolved example: /etc/systemd/resolved.conf 

DNS=2607:f130:0:f8::8198:f3f4#www.freetsa.org 2607:f130:0:f8::817e:69c7#www.freetsa.org 2607:f130:0:f8::ca3e:d470#www.freetsa.org 2607:f130:0:f8::8418:ec2d#www.freetsa.org 2607:f130:0:f8::2e57:96b#www.freetsa.org
# Don't use all the interfaces, choose one or two, for example the only IPv4 and some other IPv6 of your choice.

## Two DNSCRYPT FreeTSA servers (No logs, No DNSSEC, No anonymized DNS and No compatible with anonymization (https://github.com/DNSCrypt/dnscrypt-proxy/issues/1251))

Public server address: [2607:f130:0:f8::8418:ec2d]:553
Provider public key: d8ffbb42e031be7a79730b45568d496a4e8acb59aa8366fd6ab91e272a7d16e4
Provider name: 2.dnscrypt-cert.freetsa.org
DNS Stamp: sdns://AQcAAAAAAAAAH1syNjA3OmYxMzA6MDpmODo6MzA4NTplOTYxXTo1NTMg2P-7QuAxvnp5cwtFVo1Jak6Ky1mqg2b9arkeJyp9FuQbMi5kbnNjcnlwdC1jZXJ0LmZyZWV0c2Eub3Jn

Public server address: 142.171.183.141:553
Provider public key: d8ffbb42e031be7a79730b45568d496a4e8acb59aa8366fd6ab91e272a7d16e4
Provider name: 2.dnscrypt-cert.freetsa.org
DNS Stamp: sdns://AQcAAAAAAAAAETE3My44Mi4xOC4yMzg6NTUzINj_u0LgMb56eXMLRVaNSWpOistZqoNm_Wq5HicqfRbkGzIuZG5zY3J5cHQtY2VydC5mcmVldHNhLm9yZw

## DNSCrypt client: https://github.com/DNSCrypt/dnscrypt-proxy
</pre></div>

                       <p><b><u><a id="ipv6">FreeTSA Desktop App</a></u></b>
<br>Create a direct link to a chromium/chrome or Firefox app. This just run one command.
<br>
<pre>
### Firefox
# Activate SSB In firefox it is necessary: "about:config" > "browser.ssb.enabled true"
# On Windows: Firefox > Page Actions (three consecutive dots in the address bar) > "Use this site in App Mode" creates a link on the desktop.
# On Linux you could make a simple desktop-link / script with the following command:
firefox --ssb https://freetsa.org/index_en_app.php


### Chromium / Chrome.
chromium --app=https://freetsa.org/index_en_app.php
chrome --app=https://freetsa.org/index_en_app.php
</pre>




                        </p>
<br><p><b><u><a id="ipv6">FreeTSA IPv6 Addresses</a></u></b>

<br>Any of these IPv6 can be used for OCSP, DNSCRYPT resolution (TCP/UDP), DoT (DNS over TLS), normal DNS and NTP Server.
<pre>
2607:f130:0:f8::8198:f3f4
2607:f130:0:f8::817e:69c7
2607:f130:0:f8::ca3e:d470
2607:f130:0:f8::8418:ec2d
2607:f130:0:f8::2e57:96b
</pre>

                    </p>
<br><p><b><u><a id="sec">Security based HTTP response headers</a></u></b><br>

                     - <b>HPKP</b> helps prevent Man in the Middle attack (MitM) by mitigating fake certificates.<br>
                     - <b>HSTS</b> forces your browser to use HTTPS, which also mitigages some mitm attacks.<br>
                     - <b>CSP</b> is a way to combat xss and malware via malicious ad-injection.
                    </p>
                </div>
          </div>
      </div>
    
     <div class="footer">
          <div class="container">
              <b>Contact</b>: busilezas [@] busindre [.] com <a href="#infoModal" class="pull-right" data-toggle="modal" data-target="#infoModal">Information</a>
          </div>
      </div>
      
      <div class="modal fade" tabindex="-1" role="dialog" id="infoModal">
        <div class="modal-dialog" role="document">
          <div class="modal-content">
            <div class="modal-header">
              <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
              <h4 class="modal-title">Information</h4>
            </div>
            <div class="modal-body">
               <b>Contact</b>: busilezas [@] busindre [.] com<br/>
               <b>GPG Key</b>: <a href="https://pgp.mit.edu/pks/lookup?op=get&search=0xFDEFE63AABE8AF92">ABE8AF92</a><br/>
               <b>Design by</b>: <a target="_blank" href="https://www.falk-m.de">falk-m.de</a><br/>
               
            </div>
                          <div class="modal-footer">
              <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
            </div>
          </div><!-- /.modal-content -->
        </div><!-- /.modal-dialog -->
      </div><!-- /.modal -->

    <!-- jQuery (necessary for Bootstrap's JavaScript plugins) -->
    <script src="public/js/jquery-3.2.1.min.js"></script>
    <!-- Include all compiled plugins (below), or include individual files as needed -->
    <script src="public/js/bootstrap.min.js"></script>
    <script src="public/js/sha512.min.js"></script>
    <script src="public/js/app.js?load=3"></script>
  </body>
</html>
