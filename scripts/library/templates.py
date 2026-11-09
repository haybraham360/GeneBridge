"""
Shared wording for condition entries, by inheritance pattern. The wording
follows the existing reviewed entries (cystic fibrosis, SMA, G6PD) so every
condition reads the same way. Used by scripts/library/build_conditions.py.

Rules (PROJECT.md section 3):
- no numbers: chances come only from the inheritance engine;
- recessive carriers are always described as healthy (guardrail 3);
- dominant and X-linked entries point to a counsellor (guardrails 4, 14);
- never directive (no "recommended", "best option", "you should").
"""

EN = {
    "autosomal_recessive": {
        "inheritance_plain": "It is inherited in an autosomal recessive way: a child is affected only if they get a changed copy of {gene} from both parents.",
        "carrier_meaning": "A carrier has one changed copy. Carriers are healthy and usually do not know they are carriers until they are tested.",
        "carrier_label": "{short} carrier",
        "carrier_short": "One changed copy. Healthy. Can pass the copy on.",
        "screening": "A carrier test uses a blood or saliva sample. It looks for the most common changes and cannot find every possible change.",
        "suggested_questions": [
            "Someone in my family has {name}. Could I be a carrier?",
            "Can {name} skip a generation?",
            "What does a test for {gene} involve?",
        ],
        "counsellor_questions": [
            "Which carrier test is right for me?",
            "If I'm a carrier, could my partner be tested too?",
            "What treatment and support exist today?",
        ],
    },
    "x_linked": {
        "inheritance_plain": "It is X-linked: {gene} is on the X chromosome. Boys have one X, so one changed copy affects them. Girls have two X chromosomes and are usually carriers, though some have signs too. X-linked chances depend on which parent has the change, so a genetic counsellor talks them through with you.",
        "carrier_meaning": "A woman with one changed copy is called a carrier. Many carriers have no symptoms; some have milder effects, and a doctor can check for them.",
        "carrier_label": "{short} carrier",
        "carrier_short": "A changed copy on one X chromosome. Often no symptoms. Can pass it on.",
        "screening": "A genetic test can look for a change in {gene}. A genetic counsellor can explain who in a family might choose to be tested.",
        "suggested_questions": [
            "Why is {name} more common in boys?",
            "My brother has {name}. What could that mean for me?",
            "What does a test for {gene} involve?",
        ],
        "counsellor_questions": [
            "How is it passed on in my family?",
            "Can my sisters or daughters be tested too?",
            "What does a test involve?",
        ],
    },
    "autosomal_dominant": {
        "inheritance_plain": "It is inherited in an autosomal dominant way: one changed copy of {gene} can be enough to cause it. A parent with the change can pass it on, and the chance is the same for each pregnancy. A genetic counsellor talks this through with you.",
        "carrier_meaning": "For a dominant condition, one changed copy can be enough to cause it, so people with a change are not usually called carriers. How much it affects someone varies, and some people have few signs for many years. A genetic counsellor explains what a result means.",
        "carrier_label": "{short}: one changed copy",
        "carrier_short": "One changed copy. Can be enough to cause the condition. A counsellor explains.",
        "screening": "A genetic test can look for a change in {gene}. Testing is a personal choice, and counselling before and after the test is part of it.",
        "suggested_questions": [
            "Someone in my family has {name}. What could that mean for me?",
            "Can {name} skip a generation?",
            "What does a test for {gene} involve?",
        ],
        "counsellor_questions": [
            "What would a test result tell me, and what wouldn't it?",
            "How could this affect my children?",
            "What care and support exist today?",
        ],
    },
}

AR = {
    "autosomal_recessive": {
        "inheritance_plain": "يُورَّث بطريقة جسمية متنحية: يُصاب الطفل فقط إذا ورث نسخة متغيّرة من {gene} من كلا الوالدين.",
        "carrier_meaning": "حامل الصفة لديه نسخة متغيّرة واحدة. حاملو الصفة أصحّاء، وعادةً لا يعرفون أنهم يحملونها حتى يُجرى لهم الفحص.",
        "carrier_label": "حامل صفة {short}",
        "carrier_short": "نسخة متغيّرة واحدة. بصحة جيدة. يمكن أن تنتقل النسخة.",
        "screening": "يُجرى فحص حامل الصفة بعيّنة دم أو لعاب. يبحث عن التغيّرات الأكثر شيوعاً، ولا يمكنه اكتشاف كل تغيّر ممكن.",
        "suggested_questions": [
            "لدى أحد أفراد عائلتي {name}. هل يمكن أن أكون حاملاً للصفة؟",
            "هل يمكن لهذه الحالة أن تتخطى جيلاً؟",
            "ماذا يتضمن فحص {gene}؟",
        ],
        "counsellor_questions": [
            "ما فحص حامل الصفة المناسب لي؟",
            "إذا كنت حاملاً للصفة، هل يمكن أن يُفحص شريكي أيضاً؟",
            "ما العلاجات والدعم المتوفرة اليوم؟",
        ],
    },
    "x_linked": {
        "inheritance_plain": "يرتبط بالكروموسوم X: يقع {gene} على الكروموسوم X. لدى الأولاد كروموسوم X واحد، لذا تؤثر فيهم نسخة متغيّرة واحدة. لدى البنات كروموسومان X، وغالباً ما يكنّ حاملات للصفة، وقد تظهر على بعضهن علامات أيضاً. تعتمد الاحتمالات على أيّ الوالدين لديه التغيّر، لذا يشرحها لك مستشار وراثي.",
        "carrier_meaning": "المرأة التي لديها نسخة متغيّرة واحدة تُسمّى حاملة للصفة. كثير من حاملات الصفة ليس لديهن أعراض، ولدى بعضهن آثار أخف، ويمكن للطبيب أن يتحقق منها.",
        "carrier_label": "حاملة صفة {short}",
        "carrier_short": "نسخة متغيّرة على أحد كروموسومَي X. غالباً بلا أعراض. يمكن أن تنتقل.",
        "screening": "يمكن لفحص جيني أن يبحث عن تغيّر في {gene}. ويمكن للمستشار الوراثي أن يشرح من في العائلة قد يختار إجراء الفحص.",
        "suggested_questions": [
            "لماذا تكون هذه الحالة أكثر شيوعاً لدى الأولاد؟",
            "لدى أخي {name}. ماذا يمكن أن يعني ذلك لي؟",
            "ماذا يتضمن فحص {gene}؟",
        ],
        "counsellor_questions": [
            "كيف تنتقل هذه الحالة في عائلتي؟",
            "هل يمكن أن تُفحص أخواتي أو بناتي أيضاً؟",
            "ماذا يتضمن الفحص؟",
        ],
    },
    "autosomal_dominant": {
        "inheritance_plain": "يُورَّث بطريقة جسمية سائدة: قد تكفي نسخة متغيّرة واحدة من {gene} لحدوث الحالة. يمكن للوالد الذي لديه التغيّر أن ينقله، والاحتمال نفسه في كل حمل. يشرح لك المستشار الوراثي ذلك.",
        "carrier_meaning": "في الحالات السائدة قد تكفي نسخة متغيّرة واحدة لحدوث الحالة، لذا لا يُسمّى من لديه التغيّر عادةً حاملاً للصفة. يختلف تأثيرها من شخص لآخر، وقد تظهر لدى بعض الناس علامات قليلة لسنوات طويلة. يشرح المستشار الوراثي معنى أي نتيجة.",
        "carrier_label": "{short}: نسخة متغيّرة واحدة",
        "carrier_short": "نسخة متغيّرة واحدة. قد تكفي لحدوث الحالة. يشرح المستشار ذلك.",
        "screening": "يمكن لفحص جيني أن يبحث عن تغيّر في {gene}. إجراء الفحص قرار شخصي، والاستشارة قبل الفحص وبعده جزء منه.",
        "suggested_questions": [
            "لدى أحد أفراد عائلتي {name}. ماذا يمكن أن يعني ذلك لي؟",
            "هل يمكن لهذه الحالة أن تتخطى جيلاً؟",
            "ماذا يتضمن فحص {gene}؟",
        ],
        "counsellor_questions": [
            "ماذا ستخبرني نتيجة الفحص، وماذا لن تخبرني؟",
            "كيف يمكن أن يؤثر ذلك في أطفالي؟",
            "ما الرعاية والدعم المتوفرة اليوم؟",
        ],
    },
}
