#!/usr/bin/env python3
"""
Add funny, engaging female voice narration to each slide of the FHE pitch deck.
Generates TTS audio via espeak-ng + mbrola and embeds it into the PPTX.
"""

import subprocess
import os
import shutil
import zipfile
import tempfile
import copy
from lxml import etree

# ============ NARRATION SCRIPTS ============
# Funny, engaging, delivers the content. Like a witty colleague presenting.

NARRATIONS = {
    1: (  # Title Slide
        "Welcome to FHE Project Board! "
        "Subtitle: Why Pay Rent When You Can Own. "
        "Now, before you check your email, hear me out. "
        "This presentation is about saving the company thousands of dollars, "
        "and honestly? It's kind of a banger. "
        "Built by engineers, for engineers. Let's dive in."
    ),
    2: (  # The Problem
        "Houston, we have a subscription. "
        "Right now, we're paying Atlassian sixty two dollars and fifty cents a month "
        "for five Trello Premium licenses. "
        "That's seven hundred and fifty dollars a year. "
        "And over five years? Three thousand, seven hundred and fifty dollars. "
        "But here's the fun part. Every time we hire someone new, "
        "that number goes UP. "
        "Ten users? A hundred twenty five a month. "
        "Twenty users? Two fifty a month. "
        "Twenty users over five years? Fifteen thousand dollars. "
        "Paid directly to Atlassian. "
        "At this point, they should be sending us a fruit basket."
    ),
    3: (  # What Trello Can't Do
        "Now let's talk about what Trello can't do. "
        "And honestly, this list is longer than I expected. "
        "First: No email automation. We need incoming emails to auto-create tasks. "
        "Trello's response? Quote: Upgrade to Enterprise. End quote. How generous. "
        "Second: Per seat pricing. Every new hire costs more money. "
        "Growth should make us money, not cost us more in software. "
        "Third: Limited customization. We're adapting to Trello's workflows "
        "instead of the other way around. "
        "And fourth: Their data, their rules. "
        "Our project data lives on Atlassian's servers. We have zero control. "
        "We're renting a tool when we could own one."
    ),
    4: (  # The Solution
        "Introducing: FHE Project Board! "
        "Built by us, for us. Zero subscription fees. Unlimited users. Forever. "
        "It's got kanban boards with drag and drop, just like Trello. "
        "Email automation that converts incoming emails into task cards automatically. "
        "Unlimited users, add five, fifty, or five hundred, same cost: zero dollars per seat. "
        "Custom workflows tailored to how FHE actually works. "
        "Full data ownership, our servers, our rules. "
        "And it's mobile ready, works on any device, anywhere. "
        "Basically everything Trello does, minus the invoice."
    ),
    5: (  # Live Demo
        "Alright, this is the fun part. "
        "Don't take my word for it. It's live demo time! "
        "Yes, it actually works. No, it's not a PowerPoint animation. "
        "I know what you're thinking: a live demo in a pitch meeting? "
        "Bold move. But confidence is free, unlike Trello Premium."
    ),
    6: (  # The Money Slide
        "Okay, show me the money. This is the slide your accountant will love. "
        "On the left: Trello Premium over five years with twenty users. "
        "Fifteen thousand dollars. "
        "On the right: FHE Project Board over five years. "
        "One thousand, two hundred and seventy five dollars. "
        "That includes hosting, domain, everything. "
        "The savings? Over thirteen thousand, seven hundred and twenty five dollars. "
        "That's ninety one percent less than Trello. "
        "Math doesn't lie. And neither do I. Usually."
    ),
    7: (  # ROI Breakdown
        "Let's break down the math, because I know some of you are already doing it in your heads. "
        "Year one: Trello costs about a thousand fifty, FHE costs five hundred. "
        "We save five fifty right out of the gate. "
        "By year five, Trello's at three thousand a year, and FHE? "
        "Still two fifty five. "
        "Total savings over five years: nine thousand, seven hundred and thirty dollars. "
        "And here's the kicker: we break even in month three. "
        "Three months! That's faster than most of us finish our onboarding paperwork. "
        "Cost per new hire with our tool? Zero dollars. "
        "With Trello? Twelve fifty a month. Forever. "
        "Every new hire is free. Growth should make us money, not cost us more."
    ),
    8: (  # Bonus Features
        "But wait, there's more! "
        "And I promise this isn't an infomercial. No steak knives included. "
        "Email automation: incoming emails automatically become task cards. "
        "Filter by sender, subject, recipient. No more manual data entry. "
        "Custom workflows: tailored to how FHE actually works. "
        "Not forced into Trello's templates. Our processes, our rules. "
        "Full data ownership: data stays on OUR servers. "
        "No third party access. Full compliance. Backups on our schedule. "
        "And it works everywhere: desktop, tablet, phone. "
        "Offline support built right in. "
        "No more sorry, that's a premium feature. Everything is a premium feature. "
        "Because it's ours."
    ),
    9: (  # The Ask
        "So here's the ask. And it's a small one. "
        "Development time: forty to sixty hours to finish and polish. "
        "Hosting budget: twenty dollars a month for cloud hosting. "
        "Timeline: two to four weeks to full deployment. "
        "To put it in perspective: the total investment "
        "is less than ONE month of Trello at scale. "
        "We already have a working prototype, you literally just saw it. "
        "And the return on investment is positive by month three. "
        "This is the easiest yes you'll give all quarter."
    ),
    10: (  # Closing
        "Own your tools. Own your future. "
        "FHE Project Board. Built by engineers, for engineers. "
        "Ninety one percent cost savings. Unlimited users. "
        "Email automation. Full data control. "
        "And zero dollars per seat, forever. "
        "P.S., Atlassian won't miss us. They have plenty of subscribers. "
        "Thank you!"
    ),
}


def generate_audio(slide_num, text, output_dir):
    """Generate WAV audio using espeak-ng with mbrola female voice."""
    wav_path = os.path.join(output_dir, f"slide{slide_num}.wav")
    # mb-us1 = US English Female (mbrola)
    # -s 155 = slightly faster than default (more natural presentation pace)
    # -p 55 = slightly higher pitch
    # -a 180 = good volume
    cmd = [
        "espeak-ng",
        "-v", "mb-us1",
        "-s", "155",
        "-p", "55",
        "-a", "180",
        "-w", wav_path,
        text,
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return wav_path


def embed_audio_in_pptx(pptx_path, audio_files, output_path):
    """
    Embed WAV audio into each slide of a PPTX with auto-play on slide show.

    PPTX is a ZIP file containing XML. We need to:
    1. Add audio files to ppt/media/
    2. Add relationship entries for each slide
    3. Add audio shape XML to each slide
    4. Add [Content_Types] entry for WAV
    """
    work_dir = tempfile.mkdtemp(prefix="pptx_audio_")

    try:
        # Extract PPTX
        with zipfile.ZipFile(pptx_path, 'r') as z:
            z.extractall(work_dir)

        # Register WAV content type
        ct_path = os.path.join(work_dir, "[Content_Types].xml")
        ct_tree = etree.parse(ct_path)
        ct_root = ct_tree.getroot()
        ct_ns = ct_root.nsmap.get(None, "http://schemas.openxmlformats.org/package/2006/content-types")

        # Check if .wav extension already registered
        wav_registered = False
        for elem in ct_root:
            if elem.get("Extension") == "wav":
                wav_registered = True
                break
        if not wav_registered:
            ext_elem = etree.SubElement(ct_root, f"{{{ct_ns}}}Default")
            ext_elem.set("Extension", "wav")
            ext_elem.set("ContentType", "audio/wav")

        ct_tree.write(ct_path, xml_declaration=True, encoding="UTF-8", standalone=True)

        # Process each slide
        for slide_num, wav_path in sorted(audio_files.items()):
            slide_idx = slide_num  # 1-based
            slide_xml_path = os.path.join(work_dir, "ppt", "slides", f"slide{slide_idx}.xml")
            rels_dir = os.path.join(work_dir, "ppt", "slides", "_rels")
            rels_path = os.path.join(rels_dir, f"slide{slide_idx}.xml.rels")

            if not os.path.exists(slide_xml_path):
                print(f"Warning: slide{slide_idx}.xml not found, skipping")
                continue

            # Copy audio file to ppt/media/
            media_dir = os.path.join(work_dir, "ppt", "media")
            os.makedirs(media_dir, exist_ok=True)
            audio_filename = f"narration{slide_idx}.wav"
            shutil.copy2(wav_path, os.path.join(media_dir, audio_filename))

            # Add relationship in slide rels
            os.makedirs(rels_dir, exist_ok=True)
            if os.path.exists(rels_path):
                rels_tree = etree.parse(rels_path)
                rels_root = rels_tree.getroot()
            else:
                rels_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
                rels_root = etree.Element(f"{{{rels_ns}}}Relationships")
                rels_root.set("xmlns", rels_ns)
                rels_tree = etree.ElementTree(rels_root)

            # Find next rId
            existing_ids = []
            for rel in rels_root:
                rid = rel.get("Id", "")
                if rid.startswith("rId"):
                    try:
                        existing_ids.append(int(rid[3:]))
                    except ValueError:
                        pass
            next_id = max(existing_ids) + 1 if existing_ids else 1
            audio_rid = f"rId{next_id}"

            # Add audio relationship
            rel_ns = "http://schemas.openxmlformats.org/package/2006/relationships"
            audio_rel = etree.SubElement(rels_root, f"{{{rel_ns}}}Relationship")
            audio_rel.set("Id", audio_rid)
            audio_rel.set("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio")
            audio_rel.set("Target", f"../media/{audio_filename}")

            rels_tree.write(rels_path, xml_declaration=True, encoding="UTF-8", standalone=True)

            # Add audio shape to slide XML
            slide_tree = etree.parse(slide_xml_path)
            slide_root = slide_tree.getroot()

            # Namespaces
            nsmap = {
                'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
                'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
                'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
                'p14': 'http://schemas.microsoft.com/office/powerpoint/2010/main',
            }

            # Find spTree (shape tree)
            sp_tree = slide_root.find('.//{http://schemas.openxmlformats.org/presentationml/2006/main}spTree')
            if sp_tree is None:
                sp_tree = slide_root.find('.//{http://schemas.openxmlformats.org/presentationml/2006/main}cSld/{http://schemas.openxmlformats.org/presentationml/2006/main}spTree')
            if sp_tree is None:
                # Try without namespace
                for elem in slide_root.iter():
                    if elem.tag.endswith('}spTree'):
                        sp_tree = elem
                        break

            if sp_tree is None:
                print(f"Warning: Could not find spTree in slide {slide_idx}")
                continue

            # Create audio shape XML - placed off-slide so it's invisible
            pic_xml = f'''<p:pic xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                <p:nvPicPr>
                    <p:cNvPr id="{900 + slide_idx}" name="Narration {slide_idx}">
                        <a:hlinkClick r:id="" action="ppaction://media"/>
                    </p:cNvPr>
                    <p:cNvPicPr>
                        <a:picLocks noChangeAspect="1"/>
                    </p:cNvPicPr>
                    <p:nvPr>
                        <a:audioFile r:link="{audio_rid}"/>
                        <p:extLst>
                            <p:ext uri="{{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}}">
                                <p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"
                                           r:embed="{audio_rid}"/>
                            </p:ext>
                        </p:extLst>
                    </p:nvPr>
                </p:nvPicPr>
                <p:blipFill>
                    <a:blip/>
                    <a:stretch>
                        <a:fillRect/>
                    </a:stretch>
                </p:blipFill>
                <p:spPr>
                    <a:xfrm>
                        <a:off x="0" y="0"/>
                        <a:ext cx="609600" cy="609600"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect">
                        <a:avLst/>
                    </a:prstGeom>
                </p:spPr>
            </p:pic>'''

            pic_elem = etree.fromstring(pic_xml)
            sp_tree.append(pic_elem)

            # Now add slide transition with sound / auto-advance timing
            # Also add timing for auto-play audio
            # We use the <p:transition> and <p:timing> elements

            # Add timing to auto-play the audio when slide appears
            csld = slide_root.find('{http://schemas.openxmlformats.org/presentationml/2006/main}cSld')

            # Check for existing timing element and remove it
            existing_timing = slide_root.find('{http://schemas.openxmlformats.org/presentationml/2006/main}timing')
            if existing_timing is not None:
                slide_root.remove(existing_timing)

            # Build timing XML for auto-play audio on slide enter
            timing_xml = f'''<p:timing xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                                       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <p:tnLst>
                    <p:par>
                        <p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
                            <p:childTnLst>
                                <p:seq concurrent="1" nextAc="seek">
                                    <p:cTn id="2" dur="indefinite" nodeType="mainSeq">
                                        <p:childTnLst>
                                            <p:par>
                                                <p:cTn id="3" fill="hold">
                                                    <p:stCondLst>
                                                        <p:cond delay="0"/>
                                                    </p:stCondLst>
                                                    <p:childTnLst>
                                                        <p:par>
                                                            <p:cTn id="4" fill="hold">
                                                                <p:stCondLst>
                                                                    <p:cond delay="0"/>
                                                                </p:stCondLst>
                                                                <p:childTnLst>
                                                                    <p:audio>
                                                                        <p:cMediaNode vol="80000">
                                                                            <p:cTn id="5" fill="hold" display="0">
                                                                                <p:stCondLst>
                                                                                    <p:cond delay="0"/>
                                                                                </p:stCondLst>
                                                                            </p:cTn>
                                                                            <p:tgtEl>
                                                                                <p:spTgt spid="{900 + slide_idx}"/>
                                                                            </p:tgtEl>
                                                                        </p:cMediaNode>
                                                                    </p:audio>
                                                                </p:childTnLst>
                                                            </p:cTn>
                                                        </p:par>
                                                    </p:childTnLst>
                                                </p:cTn>
                                            </p:par>
                                        </p:childTnLst>
                                    </p:cTn>
                                    <p:prevCondLst>
                                        <p:cond evt="onPrev" delay="0">
                                            <p:tgtEl>
                                                <p:sldTgt/>
                                            </p:tgtEl>
                                        </p:cond>
                                    </p:prevCondLst>
                                    <p:nextCondLst>
                                        <p:cond evt="onNext" delay="0">
                                            <p:tgtEl>
                                                <p:sldTgt/>
                                            </p:tgtEl>
                                        </p:cond>
                                    </p:nextCondLst>
                                </p:seq>
                            </p:childTnLst>
                        </p:cTn>
                    </p:par>
                </p:tnLst>
            </p:timing>'''

            timing_elem = etree.fromstring(timing_xml)
            slide_root.append(timing_elem)

            slide_tree.write(slide_xml_path, xml_declaration=True, encoding="UTF-8", standalone=True)
            print(f"  Embedded audio in slide {slide_idx}")

        # Repack into PPTX
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zout:
            for dirpath, dirnames, filenames in os.walk(work_dir):
                for fn in filenames:
                    full_path = os.path.join(dirpath, fn)
                    arcname = os.path.relpath(full_path, work_dir)
                    zout.write(full_path, arcname)

        print(f"\nNarrated presentation saved to: {output_path}")
        print(f"File size: {os.path.getsize(output_path) / 1024:.1f} KB")

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main():
    pptx_input = "/home/user/fhe-TRELLO-/FHE_Project_Board_Pitch.pptx"
    pptx_output = "/home/user/fhe-TRELLO-/FHE_Project_Board_Pitch_Narrated.pptx"
    audio_dir = tempfile.mkdtemp(prefix="slide_audio_")

    # First, make sure the base presentation exists
    if not os.path.exists(pptx_input):
        print("Base presentation not found. Generating it first...")
        subprocess.run(["python3", "/home/user/fhe-TRELLO-/create_presentation.py"], check=True)

    print("=" * 60)
    print("GENERATING SLIDE NARRATIONS")
    print("=" * 60)

    audio_files = {}
    for slide_num, text in sorted(NARRATIONS.items()):
        print(f"  Generating audio for slide {slide_num}...")
        wav_path = generate_audio(slide_num, text, audio_dir)
        audio_files[slide_num] = wav_path
        size_kb = os.path.getsize(wav_path) / 1024
        print(f"    -> {size_kb:.0f} KB")

    print()
    print("=" * 60)
    print("EMBEDDING AUDIO INTO PRESENTATION")
    print("=" * 60)

    embed_audio_in_pptx(pptx_input, audio_files, pptx_output)

    # Cleanup temp audio
    shutil.rmtree(audio_dir, ignore_errors=True)

    print()
    print("=" * 60)
    print("DONE!")
    print("=" * 60)
    print(f"Open {pptx_output} in PowerPoint and enter Slide Show mode.")
    print("Each slide will auto-narrate when it appears!")


if __name__ == "__main__":
    main()
